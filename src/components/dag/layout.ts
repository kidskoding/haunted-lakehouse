import { findCycle } from "../../lib/pipeline/dag";
import type { Materialization } from "../../lib/pipeline/types";

/** The lakehouse layers, drawn left to right. */
export type DagLayer = "bronze" | "silver" | "gold";

/**
 * What the graph needs to know about a model. `CompiledModel` satisfies it, so a compiled
 * pipeline's models pass straight in. `materialization` is null for a model known only from
 * a compile error.
 */
export interface DagModel {
  readonly id: string;
  readonly materialization: Materialization | null;
  readonly refs: readonly string[];
  readonly active: boolean;
}

export type DagNodeKind = "feed" | "model" | "placeholder";

export interface DagNode {
  /** `schema.name`; a placeholder's id is `<layer>.*`. */
  readonly id: string;
  readonly layer: DagLayer;
  readonly name: string;
  readonly kind: DagNodeKind;
  /** Column index, left to right. */
  readonly column: number;
  readonly x: number;
  readonly y: number;
}

/** Data flows `from` → `to`. A loop edge closes a cycle and is drawn back over the top. */
export interface DagEdge {
  readonly from: string;
  readonly to: string;
  readonly loop: boolean;
}

export interface DagColumnLabel {
  readonly layer: DagLayer;
  readonly x: number;
}

export interface DagLayout {
  /** Every node, by column, then top to bottom. */
  readonly nodes: readonly DagNode[];
  readonly edges: readonly DagEdge[];
  /** Where each layer's first column starts, for its heading. */
  readonly columns: readonly DagColumnLabel[];
  readonly width: number;
  readonly height: number;
  /** Model ids in DAG order: column by column, top to bottom. Keyboard order follows it. */
  readonly order: readonly string[];
  /** The first cycle among the models, as `[a, b, a]`, or null. */
  readonly cycle: readonly string[] | null;
  /** True when there are models but none of them is in gold. */
  readonly missingGold: boolean;
}

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 52;
const COLUMN_GAP = 64;
const ROW_GAP = 16;
const PADDING = 16;
const LABEL_ROOM = 32;
const LOOP_ROOM = 44;

interface Point {
  readonly x: number;
  readonly y: number;
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function layerOf(id: string): DagLayer {
  if (id.startsWith("bronze.")) return "bronze";
  return id.startsWith("gold.") ? "gold" : "silver";
}

function nameOf(id: string): string {
  return id.slice(id.indexOf(".") + 1);
}

/**
 * Marks the edges that close a cycle: a depth-first search over each model's references, in
 * id order, flags an edge whose upstream end is still on the stack. Removing them leaves a DAG.
 */
function loopEdges(deps: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
  const loops = new Set<string>();
  const done = new Set<string>();
  const onStack = new Set<string>();
  const visit = (id: string) => {
    onStack.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (!deps.has(dep)) continue;
      if (onStack.has(dep)) loops.add(`${dep}\n${id}`);
      else if (!done.has(dep)) visit(dep);
    }
    onStack.delete(id);
    done.add(id);
  };
  for (const id of [...deps.keys()].sort(compareIds)) if (!done.has(id)) visit(id);
  return loops;
}

/**
 * Lays the pipeline out in columns, left to right: bronze feeds, then silver, then gold. Each
 * node sits one column right of its furthest upstream node, so every edge but a cycle's runs
 * rightward; rows are ordered by the barycenter of their neighbours to untangle edges. Pure
 * and deterministic: the same models and feeds give the same layout in any input order.
 */
export function layoutDag(models: readonly DagModel[], feeds: readonly string[] = []): DagLayout {
  const byId = new Map<string, DagModel>();
  for (const model of [...models].sort((a, b) => compareIds(a.id, b.id))) {
    if (!byId.has(model.id)) byId.set(model.id, model);
  }
  const modelIds = [...byId.keys()];
  const feedIds = new Set(feeds.map((feed) => `bronze.${feed.toLowerCase()}`));
  for (const model of byId.values()) {
    for (const ref of model.refs) if (layerOf(ref) === "bronze") feedIds.add(ref);
  }

  const deps = new Map(
    modelIds.map((id) => {
      const refs = new Set(byId.get(id)?.refs ?? []);
      return [id, [...refs].filter((ref) => byId.has(ref) || feedIds.has(ref)).sort(compareIds)];
    }),
  );
  const loops = loopEdges(deps);
  const edges: DagEdge[] = modelIds.flatMap((id) =>
    (deps.get(id) ?? []).map((from) => ({ from, to: id, loop: loops.has(`${from}\n${id}`) })),
  );

  const rankOf = (goldFloor: number): Map<string, number> => {
    const ranks = new Map<string, number>([...feedIds].map((id) => [id, 0]));
    const rank = (id: string): number => {
      const known = ranks.get(id);
      if (known !== undefined) return known;
      let value = layerOf(id) === "gold" ? goldFloor : 1;
      for (const dep of deps.get(id) ?? []) {
        if (!loops.has(`${dep}\n${id}`)) value = Math.max(value, rank(dep) + 1);
      }
      ranks.set(id, value);
      return value;
    };
    for (const id of modelIds) rank(id);
    return ranks;
  };
  const firstPass = rankOf(1);
  const silverRanks = modelIds.filter((id) => layerOf(id) === "silver");
  const ranks = rankOf(Math.max(1, ...silverRanks.map((id) => (firstPass.get(id) ?? 0) + 1)));

  const hasSilver = silverRanks.length > 0;
  const hasGold = modelIds.some((id) => layerOf(id) === "gold");
  const placeholders: string[] = [];
  if (!hasSilver && !hasGold) {
    placeholders.push("silver.*", "gold.*");
    ranks.set("silver.*", 1);
    ranks.set("gold.*", 2);
  } else if (!hasGold) {
    placeholders.push("gold.*");
    ranks.set("gold.*", Math.max(...ranks.values()) + 1);
  }

  // Compact the ranks into columns so an empty bronze column takes no room.
  const usedRanks = [...new Set(ranks.values())].sort((a, b) => a - b);
  const columnOf = new Map(usedRanks.map((rank, index) => [rank, index]));
  const columns: string[][] = usedRanks.map(() => []);
  for (const [id, rank] of [...ranks].sort(([a], [b]) => compareIds(a, b))) {
    columns[columnOf.get(rank) ?? 0]?.push(id);
  }
  for (const column of columns) {
    column.sort((a, b) => Number(placeholders.includes(a)) - Number(placeholders.includes(b)));
  }

  const flowing = edges.filter((edge) => !edge.loop);
  const offset = new Map<string, number>();
  const place = (column: readonly string[]) => {
    column.forEach((id, row) => offset.set(id, row - (column.length - 1) / 2));
  };
  columns.forEach(place);
  const sweep = (index: number, neighbours: (id: string) => readonly string[]) => {
    const column = columns[index];
    if (!column) return;
    const key = (id: string) => {
      const around = neighbours(id).map((other) => offset.get(other) ?? 0);
      if (around.length === 0) return offset.get(id) ?? 0;
      return around.reduce((sum, value) => sum + value, 0) / around.length;
    };
    const keys = new Map(column.map((id) => [id, key(id)]));
    column.sort(
      (a, b) =>
        (keys.get(a) ?? 0) - (keys.get(b) ?? 0) ||
        (offset.get(a) ?? 0) - (offset.get(b) ?? 0) ||
        compareIds(a, b),
    );
    place(column);
  };
  const upstreamOf = (id: string) => flowing.filter((e) => e.to === id).map((e) => e.from);
  const downstreamOf = (id: string) => flowing.filter((e) => e.from === id).map((e) => e.to);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < columns.length; index += 1) sweep(index, upstreamOf);
    for (let index = columns.length - 2; index >= 0; index -= 1) sweep(index, downstreamOf);
  }

  const tallest = Math.max(1, ...columns.map((column) => column.length));
  const pitch = NODE_HEIGHT + ROW_GAP;
  const top = PADDING + LABEL_ROOM + (loops.size > 0 ? LOOP_ROOM : 0);
  const nodes: DagNode[] = columns.flatMap((column, index) =>
    column.map((id, row) => ({
      id,
      layer: layerOf(id),
      name: nameOf(id),
      kind: placeholders.includes(id) ? "placeholder" : byId.has(id) ? "model" : "feed",
      column: index,
      x: PADDING + index * (NODE_WIDTH + COLUMN_GAP),
      y: top + ((tallest - column.length) * pitch) / 2 + row * pitch,
    })),
  );

  const labels: DagColumnLabel[] = [];
  for (const node of nodes) {
    if (!labels.some((label) => label.layer === node.layer || label.x === node.x)) {
      labels.push({ layer: node.layer, x: node.x });
    }
  }

  return {
    nodes,
    edges,
    columns: labels,
    width: PADDING * 2 + columns.length * NODE_WIDTH + (columns.length - 1) * COLUMN_GAP,
    height: top + tallest * pitch - ROW_GAP + PADDING,
    order: nodes.filter((node) => node.kind === "model").map((node) => node.id),
    cycle: findCycle(deps),
    missingGold: modelIds.length > 0 && !hasGold,
  };
}

/** The label row's baseline band, for column headings. */
export const LABEL_TOP = PADDING;

/**
 * The SVG path of an edge between two node origins. A flowing edge leaves the right side of
 * its source and enters the left side of its target; a loop edge arcs back over both.
 */
export function edgePath(from: Point, to: Point, loop: boolean): string {
  const middle = NODE_HEIGHT / 2;
  if (!loop) {
    const sx = from.x + NODE_WIDTH;
    const sy = from.y + middle;
    const tx = to.x;
    const ty = to.y + middle;
    const bend = Math.max(24, (tx - sx) / 2);
    return `M${String(sx)} ${String(sy)}C${String(sx + bend)} ${String(sy)} ${String(tx - bend)} ${String(ty)} ${String(tx)} ${String(ty)}`;
  }
  const sx = from.x + NODE_WIDTH * 0.62;
  const tx = to.x + NODE_WIDTH * 0.38;
  // A cubic's peak sits three quarters of the way to its control points.
  const lift = Math.min(from.y, to.y) - ((LOOP_ROOM - 8) * 4) / 3;
  return `M${String(sx)} ${String(from.y)}C${String(sx)} ${String(lift)} ${String(tx)} ${String(lift)} ${String(tx)} ${String(to.y)}`;
}

/** Every node upstream and downstream of `id`, following edges both ways. `id` itself is omitted. */
export function lineage(
  edges: readonly DagEdge[],
  id: string,
): { readonly upstream: ReadonlySet<string>; readonly downstream: ReadonlySet<string> } {
  const walk = (next: (node: string) => readonly string[]) => {
    const seen = new Set<string>();
    const queue = [...next(id)];
    for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
      if (node === id || seen.has(node)) continue;
      seen.add(node);
      queue.push(...next(node));
    }
    return seen;
  };
  return {
    upstream: walk((node) => edges.filter((e) => e.to === node).map((e) => e.from)),
    downstream: walk((node) => edges.filter((e) => e.from === node).map((e) => e.to)),
  };
}
