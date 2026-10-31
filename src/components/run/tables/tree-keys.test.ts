import { describe, expect, it } from "vitest";
import { treeAction, type TreeRow } from "./tree-keys";

const open: TreeRow[] = [
  { key: "a", parent: null, expandable: true, expanded: true },
  { key: "a.x", parent: "a", expandable: false, expanded: false },
  { key: "a.y", parent: "a", expandable: false, expanded: false },
  { key: "b", parent: null, expandable: true, expanded: false },
];

describe("treeAction", () => {
  it("steps and jumps through the visible rows without wrapping", () => {
    expect(treeAction(open, "a", "ArrowDown")).toEqual({ type: "focus", key: "a.x" });
    expect(treeAction(open, "a.x", "ArrowUp")).toEqual({ type: "focus", key: "a" });
    expect(treeAction(open, "a", "ArrowUp")).toBeUndefined();
    expect(treeAction(open, "b", "ArrowDown")).toBeUndefined();
    expect(treeAction(open, "a.y", "Home")).toEqual({ type: "focus", key: "a" });
    expect(treeAction(open, "a", "End")).toEqual({ type: "focus", key: "b" });
  });

  it("opens a closed row, then enters it", () => {
    expect(treeAction(open, "b", "ArrowRight")).toEqual({
      type: "expand",
      key: "b",
      expanded: true,
    });
    expect(treeAction(open, "a", "ArrowRight")).toEqual({ type: "focus", key: "a.x" });
    expect(treeAction(open, "a.x", "ArrowRight")).toBeUndefined();
  });

  it("closes an open row, and climbs from a child to its parent", () => {
    expect(treeAction(open, "a", "ArrowLeft")).toEqual({
      type: "expand",
      key: "a",
      expanded: false,
    });
    expect(treeAction(open, "a.y", "ArrowLeft")).toEqual({ type: "focus", key: "a" });
    expect(treeAction(open, "b", "ArrowLeft")).toBeUndefined();
  });

  it("activates on Enter and Space, and ignores other keys and unknown rows", () => {
    expect(treeAction(open, "a.x", "Enter")).toEqual({ type: "activate", key: "a.x" });
    expect(treeAction(open, "a", " ")).toEqual({ type: "activate", key: "a" });
    expect(treeAction(open, "a", "q")).toBeUndefined();
    expect(treeAction(open, "zzz", "ArrowDown")).toBeUndefined();
  });
});
