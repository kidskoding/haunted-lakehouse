import { describe, expect, it } from "vitest";
import { edgePath, layoutDag, lineage, NODE_HEIGHT, NODE_WIDTH, type DagModel } from "./layout";

const model = (id: string, refs: readonly string[], extras: Partial<DagModel> = {}): DagModel => ({
  id,
  materialization: extras.materialization ?? "table",
  refs,
  active: extras.active ?? true,
});

describe("layoutDag", () => {
  it("is deterministic across shuffled input", () => {
    const models = [
      model("gold.lit", ["silver.latest"]),
      model("silver.latest", ["bronze.porch_events"]),
      model("silver.counts", ["bronze.porch_events"]),
    ];
    const feeds = ["porch_events", "door_scans"];
    const forward = layoutDag(models, feeds);
    const backward = layoutDag([...models].reverse(), [...feeds].reverse());
    expect(backward).toEqual(forward);
  });

  it("lays bronze, silver, and gold left to right with feeds from the hour", () => {
    const layout = layoutDag(
      [model("gold.lit", ["silver.latest"]), model("silver.latest", ["bronze.porch_events"])],
      ["porch_events"],
    );
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(byId.get("bronze.porch_events")?.column).toBe(0);
    expect(byId.get("silver.latest")?.column).toBe(1);
    expect(byId.get("gold.lit")?.column).toBe(2);
    expect(layout.order).toEqual(["silver.latest", "gold.lit"]);
    expect(layout.missingGold).toBe(false);
    expect(layout.cycle).toBeNull();
    expect(layout.width).toBeGreaterThan(NODE_WIDTH * 3);
    expect(layout.height).toBeGreaterThan(NODE_HEIGHT);
  });

  it("keeps every flowing edge pointing rightward", () => {
    const layout = layoutDag(
      [
        model("gold.score", ["silver.a", "silver.b"]),
        model("silver.a", ["bronze.votes"]),
        model("silver.b", ["bronze.votes", "silver.a"]),
      ],
      ["votes"],
    );
    const at = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges.filter((e) => !e.loop)) {
      expect((at.get(edge.to)?.x ?? 0) > (at.get(edge.from)?.x ?? 0)).toBe(true);
    }
  });

  it("marks cycle edges and reports the cycle path", () => {
    const layout = layoutDag(
      [model("silver.a", ["silver.b"]), model("silver.b", ["silver.a"])],
      [],
    );
    expect(layout.cycle).toEqual(["silver.a", "silver.b", "silver.a"]);
    expect(layout.edges.filter((edge) => edge.loop)).toHaveLength(1);
    expect(layout.missingGold).toBe(true);
  });

  it("draws placeholders when a layer is empty", () => {
    const empty = layoutDag([], ["porch_events"]);
    expect(empty.nodes.map((node) => node.id).sort()).toEqual([
      "bronze.porch_events",
      "gold.*",
      "silver.*",
    ]);
    expect(empty.order).toEqual([]);

    const silverOnly = layoutDag([model("silver.x", ["bronze.porch_events"])], ["porch_events"]);
    expect(silverOnly.nodes.some((node) => node.id === "gold.*")).toBe(true);
    expect(silverOnly.missingGold).toBe(true);
  });

  it("pulls bronze feeds from model refs even when the hour list omits them", () => {
    const layout = layoutDag([model("silver.x", ["bronze.door_scans"])], []);
    expect(layout.nodes.some((node) => node.id === "bronze.door_scans")).toBe(true);
  });
});

describe("lineage", () => {
  it("walks both directions, including through a loop", () => {
    const layout = layoutDag(
      [
        model("gold.z", ["silver.b"]),
        model("silver.a", ["bronze.f", "silver.b"]),
        model("silver.b", ["silver.a"]),
      ],
      ["f"],
    );
    const { upstream, downstream } = lineage(layout.edges, "silver.a");
    expect([...upstream].sort()).toEqual(["bronze.f", "silver.b"]);
    expect([...downstream].sort()).toEqual(["gold.z", "silver.b"]);
  });
});

describe("edgePath", () => {
  it("draws a cubic from the right of the source to the left of the target", () => {
    const mid = NODE_HEIGHT / 2;
    const path = edgePath({ x: 0, y: 0 }, { x: 248, y: 68 }, false);
    expect(path).toBe(
      `M${String(NODE_WIDTH)} ${String(mid)}C${String(NODE_WIDTH + 32)} ${String(mid)} ${String(248 - 32)} ${String(68 + mid)} 248 ${String(68 + mid)}`,
    );
  });

  it("arcs a loop edge over the top", () => {
    const path = edgePath({ x: 200, y: 80 }, { x: 0, y: 80 }, true);
    expect(path.startsWith("M")).toBe(true);
    expect(path).toContain("C");
    // Control points sit above both nodes so the cubic clears the label row.
    expect(path).toMatch(/C[\d.]+ -?\d/);
  });
});
