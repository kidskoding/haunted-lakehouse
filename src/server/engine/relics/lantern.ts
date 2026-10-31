import "server-only";
import type { Cell, PuzzleData, Row } from "../puzzle";
import { RelicError } from "./errors";

/**
 * A column's type as the rows show it. `unknown` means every value seen so far was null;
 * `mixed` means one delivery carried values of more than one type.
 */
export type ColumnType = "number" | "text" | "boolean" | "unknown" | "mixed";

export interface Column {
  readonly name: string;
  readonly type: ColumnType;
}

/**
 * How a feed's shape changed. There is no rename: on the wire a renamed column is one column
 * gone and another arrived, and telling it apart from a real drop and add is the player's
 * reasoning to do, not the relic's.
 */
export type SchemaChange =
  | { readonly kind: "added"; readonly column: string; readonly type: ColumnType }
  | { readonly kind: "dropped"; readonly column: string }
  | {
      readonly kind: "retyped";
      readonly column: string;
      readonly from: ColumnType;
      readonly to: ColumnType;
    };

/** One shape the feed held, from the first batch that delivered it in that shape. */
export interface SchemaVersion {
  readonly fromBatch: number;
  readonly arrivesAt: string;
  readonly columns: readonly Column[];
  /** How this shape differs from the one before it; empty for the first. */
  readonly changes: readonly SchemaChange[];
}

export interface SchemaHistory {
  readonly feed: string;
  /** Every shape the feed takes across the whole night, hidden batches included. */
  readonly versions: readonly SchemaVersion[];
}

/** Every feed delivered during the night, by name. */
export function feedNames(data: PuzzleData): string[] {
  return [...new Set(data.batches.flatMap((batch) => Object.keys(batch.feeds)))].sort();
}

function cellType(value: Cell): ColumnType {
  if (value === null) return "unknown";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function combine(a: ColumnType, b: ColumnType): ColumnType {
  if (a === "unknown") return b;
  if (b === "unknown" || a === b) return a;
  return "mixed";
}

/** Null says nothing about a type, so an all-null column fits any type. */
function compatible(a: ColumnType, b: ColumnType): boolean {
  return a === "unknown" || b === "unknown" || a === b;
}

/** The columns one batch's rows carry, in the order they first appear. */
function shapeOf(rows: readonly Row[]): Column[] {
  const types = new Map<string, ColumnType>();
  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) {
      types.set(name, combine(types.get(name) ?? "unknown", cellType(value)));
    }
  }
  return [...types].map(([name, type]) => ({ name, type }));
}

/** Gives each column the type the other shape knew for it, where this one saw only nulls. */
function refine(columns: readonly Column[], known: readonly Column[]): Column[] {
  const types = new Map(known.map(({ name, type }) => [name, type]));
  return columns.map(({ name, type }) => ({
    name,
    type: combine(type, types.get(name) ?? "unknown"),
  }));
}

function changesBetween(before: readonly Column[], after: readonly Column[]): SchemaChange[] {
  const typeAfter = new Map(after.map(({ name, type }) => [name, type]));
  const typeBefore = new Map(before.map(({ name, type }) => [name, type]));
  const changes: SchemaChange[] = [];
  for (const { name } of before) {
    if (!typeAfter.has(name)) changes.push({ kind: "dropped", column: name });
  }
  for (const { name, type } of after) {
    const was = typeBefore.get(name);
    if (was === undefined) changes.push({ kind: "added", column: name, type });
    else if (!compatible(was, type))
      changes.push({ kind: "retyped", column: name, from: was, to: type });
  }
  return changes;
}

interface Draft {
  readonly fromBatch: number;
  readonly arrivesAt: string;
  columns: Column[];
  readonly changes: readonly SchemaChange[];
}

/**
 * The schema history Wren's Lantern reveals: each shape a feed's rows take across the night,
 * read from the rows themselves rather than from any spec, so it shows exactly what a
 * pipeline will meet. A batch that delivers nothing to the feed says nothing about its shape.
 */
export function schemaHistory(data: PuzzleData, feed: string): SchemaHistory {
  if (!feedNames(data).includes(feed)) {
    throw new RelicError("unknown-feed", `No feed named ${feed} arrives tonight.`);
  }
  const versions: Draft[] = [];
  for (const batch of data.batches) {
    const rows = batch.feeds[feed] ?? [];
    if (rows.length === 0) continue;
    const shape = shapeOf(rows);
    const current = versions.at(-1);
    if (!current) {
      versions.push({
        fromBatch: batch.index,
        arrivesAt: batch.arrivesAt,
        columns: shape,
        changes: [],
      });
      continue;
    }
    const changes = changesBetween(current.columns, shape);
    if (changes.length === 0) {
      // The same shape again, which may settle a type the version saw only as nulls.
      current.columns = refine(current.columns, shape);
      continue;
    }
    versions.push({
      fromBatch: batch.index,
      arrivesAt: batch.arrivesAt,
      columns: refine(shape, current.columns),
      changes,
    });
  }
  // A column added while still null takes the type its version settled on later.
  return {
    feed,
    versions: versions.map((version) => {
      const settled = new Map(version.columns.map(({ name, type }) => [name, type]));
      return {
        ...version,
        changes: version.changes.map((change) =>
          change.kind === "added"
            ? { ...change, type: settled.get(change.column) ?? change.type }
            : change,
        ),
      };
    }),
  };
}
