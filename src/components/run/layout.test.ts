import { describe, expect, it } from "vitest";
import {
  BIG_STEP,
  clampLayout,
  DEFAULT_LAYOUT,
  EDITOR_MIN,
  editorShare,
  keyAction,
  PANE_LIMITS,
  paneBounds,
  parseLayout,
  serializeLayout,
  setPane,
  shareAt,
  STEP,
} from "./layout";

describe("setPane", () => {
  it("sets a pane inside its limits", () => {
    expect(setPane(DEFAULT_LAYOUT, "left", 40).left).toBe(40);
  });

  it("clamps to the pane's own limits", () => {
    expect(setPane(DEFAULT_LAYOUT, "left", 5).left).toBe(PANE_LIMITS.left.min);
    expect(setPane(DEFAULT_LAYOUT, "story", 99).story).toBe(PANE_LIMITS.story.max);
  });

  it("never lets the dag and results squeeze the editor below its floor", () => {
    const tall = setPane(DEFAULT_LAYOUT, "results", 50);
    expect(tall.results).toBe(100 - EDITOR_MIN - DEFAULT_LAYOUT.dag);
    const grown = setPane(tall, "dag", 42);
    expect(grown.dag).toBe(DEFAULT_LAYOUT.dag);
    expect(editorShare(grown)).toBe(EDITOR_MIN);
  });

  it("ignores non-finite values", () => {
    expect(setPane(DEFAULT_LAYOUT, "dag", Number.NaN)).toBe(DEFAULT_LAYOUT);
    expect(setPane(DEFAULT_LAYOUT, "dag", Number.POSITIVE_INFINITY)).toBe(DEFAULT_LAYOUT);
  });

  it("rounds to tenths so stored values stay short", () => {
    expect(setPane(DEFAULT_LAYOUT, "left", 33.333333).left).toBe(33.3);
  });
});

describe("paneBounds", () => {
  it("lowers the dag's ceiling as results grow", () => {
    expect(paneBounds({ ...DEFAULT_LAYOUT, results: 20 }, "dag").max).toBe(PANE_LIMITS.dag.max);
    expect(paneBounds({ ...DEFAULT_LAYOUT, results: 45 }, "dag").max).toBe(100 - EDITOR_MIN - 45);
  });

  it("leaves the left column and story bounds fixed", () => {
    expect(paneBounds(DEFAULT_LAYOUT, "left")).toEqual(PANE_LIMITS.left);
    expect(paneBounds(DEFAULT_LAYOUT, "story")).toEqual(PANE_LIMITS.story);
  });
});

describe("clampLayout", () => {
  it("keeps the default layout as it is", () => {
    expect(clampLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
  });

  it("fits results around the dag when both are too large", () => {
    const fixed = clampLayout({ left: 80, story: 0, dag: 60, results: 60 });
    expect(fixed).toEqual({
      left: PANE_LIMITS.left.max,
      story: PANE_LIMITS.story.min,
      dag: PANE_LIMITS.dag.max,
      results: 100 - EDITOR_MIN - PANE_LIMITS.dag.max,
    });
    expect(editorShare(fixed)).toBeGreaterThanOrEqual(EDITOR_MIN);
  });
});

describe("parseLayout", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(parseLayout(null)).toBe(DEFAULT_LAYOUT);
  });

  it("round-trips a saved layout", () => {
    const sizes = { left: 40, story: 62.5, dag: 20, results: 35 };
    expect(parseLayout(serializeLayout(sizes))).toEqual(sizes);
  });

  it.each(["", "not json", "null", "42", '"left"', "[30, 50, 20, 30]", "true"])(
    "recovers from %j",
    (raw) => {
      expect(parseLayout(raw)).toBe(DEFAULT_LAYOUT);
    },
  );

  it("falls back field by field for missing or mistyped values", () => {
    expect(parseLayout(JSON.stringify({ left: 40, story: "wide", dag: null }))).toEqual({
      ...DEFAULT_LAYOUT,
      left: 40,
    });
  });

  it("clamps hand-edited values back into range", () => {
    const parsed = parseLayout(JSON.stringify({ left: 0, story: 500, dag: -3, results: 99 }));
    expect(parsed.left).toBe(PANE_LIMITS.left.min);
    expect(parsed.story).toBe(PANE_LIMITS.story.max);
    expect(parsed.dag).toBe(PANE_LIMITS.dag.min);
    expect(parsed.results).toBe(PANE_LIMITS.results.max);
    expect(editorShare(parsed)).toBeGreaterThanOrEqual(EDITOR_MIN);
  });

  it("ignores unknown keys when serializing", () => {
    const parsed = parseLayout(JSON.stringify({ ...DEFAULT_LAYOUT, extra: 7 }));
    expect(JSON.parse(serializeLayout(parsed))).toEqual(DEFAULT_LAYOUT);
  });
});

describe("keyAction", () => {
  it("moves a vertical splitter with left and right", () => {
    expect(keyAction("ArrowRight", false, "vertical", "before")).toEqual({
      kind: "step",
      delta: STEP,
    });
    expect(keyAction("ArrowLeft", false, "vertical", "before")).toEqual({
      kind: "step",
      delta: -STEP,
    });
    expect(keyAction("ArrowUp", false, "vertical", "before")).toBeNull();
  });

  it("moves a horizontal splitter with up and down", () => {
    expect(keyAction("ArrowDown", false, "horizontal", "before")).toEqual({
      kind: "step",
      delta: STEP,
    });
    expect(keyAction("ArrowRight", false, "horizontal", "before")).toBeNull();
  });

  it("grows a pane below its splitter when the line moves up", () => {
    expect(keyAction("ArrowUp", false, "horizontal", "after")).toEqual({
      kind: "step",
      delta: STEP,
    });
    expect(keyAction("ArrowDown", false, "horizontal", "after")).toEqual({
      kind: "step",
      delta: -STEP,
    });
  });

  it("takes bigger steps with Shift", () => {
    expect(keyAction("ArrowRight", true, "vertical", "before")).toEqual({
      kind: "step",
      delta: BIG_STEP,
    });
  });

  it("maps Home, End, and Enter", () => {
    expect(keyAction("Home", false, "vertical", "before")).toEqual({ kind: "min" });
    expect(keyAction("End", false, "horizontal", "after")).toEqual({ kind: "max" });
    expect(keyAction("Enter", false, "vertical", "before")).toEqual({ kind: "reset" });
    expect(keyAction("Tab", false, "vertical", "before")).toBeNull();
  });
});

describe("shareAt", () => {
  it("measures a pane before the splitter from the region's start", () => {
    expect(shareAt(300, 100, 1000, "before")).toBe(20);
  });

  it("measures a pane after the splitter from the region's end", () => {
    expect(shareAt(800, 100, 1000, "after")).toBe(30);
  });

  it("returns NaN for a region with no size", () => {
    expect(shareAt(10, 0, 0, "before")).toBeNaN();
  });
});
