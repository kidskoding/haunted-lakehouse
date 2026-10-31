import { describe, expect, it } from "vitest";
import { findCycle, topologicalOrder, type ModelGraph } from "./dag";

function graph(edges: Record<string, string[]>): ModelGraph {
  return new Map(Object.entries(edges));
}

describe("topologicalOrder", () => {
  it("puts every model after the models it reads", () => {
    const order = topologicalOrder(
      graph({
        "gold.lit": ["silver.state", "bronze.porch_events"],
        "silver.state": ["bronze.porch_events"],
      }),
    );
    expect(order).toEqual(["silver.state", "gold.lit"]);
  });

  it("breaks ties by schema.name in code-unit order, whatever order models arrive in", () => {
    const edges = {
      "silver.b": [],
      "silver.a": [],
      "silver.Z": [],
      "gold.z": ["silver.a"],
      "gold.a": ["silver.b"],
      "silver.c": ["silver.a"],
    };
    // Uppercase sorts before lowercase, and the ready set is re-sorted as models are released.
    expect(topologicalOrder(graph(edges))).toEqual([
      "silver.Z",
      "silver.a",
      "gold.z",
      "silver.b",
      "gold.a",
      "silver.c",
    ]);
    const reversed = Object.fromEntries(Object.entries(edges).reverse());
    expect(topologicalOrder(graph(reversed))).toEqual(topologicalOrder(graph(edges)));
  });

  it("counts a repeated reference once and ignores names outside the graph", () => {
    expect(
      topologicalOrder(
        graph({ "gold.a": ["silver.a", "silver.a", "silver.gone"], "silver.a": [] }),
      ),
    ).toEqual(["silver.a", "gold.a"]);
  });

  it("leaves out models on or downstream of a cycle", () => {
    expect(
      topologicalOrder(
        graph({ "silver.a": ["silver.b"], "silver.b": ["silver.a"], "gold.x": ["silver.a"] }),
      ),
    ).toEqual([]);
  });
});

describe("findCycle", () => {
  it("returns null for an acyclic graph", () => {
    expect(findCycle(graph({ "gold.a": ["silver.a"], "silver.a": [] }))).toBeNull();
  });

  it("reports a self-reference as a one-model cycle", () => {
    expect(findCycle(graph({ "silver.visits": ["silver.visits"] }))).toEqual([
      "silver.visits",
      "silver.visits",
    ]);
  });

  it("reports the first cycle a depth-first search in schema.name order finds", () => {
    const edges = {
      "silver.c": ["silver.d"],
      "silver.d": ["silver.c"],
      "silver.b": ["silver.c", "silver.a"],
      "silver.a": ["silver.b"],
    };
    expect(findCycle(graph(edges))).toEqual(["silver.a", "silver.b", "silver.a"]);
    const reversed = Object.fromEntries(Object.entries(edges).reverse());
    expect(findCycle(graph(reversed))).toEqual(["silver.a", "silver.b", "silver.a"]);
  });

  it("starts the reported path where the search re-entered the cycle", () => {
    expect(
      findCycle(
        graph({
          "gold.report": ["silver.x"],
          "silver.x": ["silver.y"],
          "silver.y": ["silver.z"],
          "silver.z": ["silver.x"],
        }),
      ),
    ).toEqual(["silver.x", "silver.y", "silver.z", "silver.x"]);
  });
});
