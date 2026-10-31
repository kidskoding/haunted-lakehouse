import { describe, expect, it } from "vitest";
import {
  bodyScale,
  columnOffsets,
  columnWindow,
  MAX_BODY_PX,
  reveal,
  rowWindow,
} from "./windowing";

describe("bodyScale", () => {
  it("lays out a small body at full size", () => {
    expect(bodyScale(100, 28, 400)).toEqual({
      virtualHeight: 2800,
      physicalHeight: 2800,
      ratio: 1,
    });
  });

  it("caps a million rows and maps the physical scroll range onto the virtual one", () => {
    const scale = bodyScale(1_000_000, 28, 400);
    expect(scale.virtualHeight).toBe(28_000_000);
    expect(scale.physicalHeight).toBe(MAX_BODY_PX);
    // The last physical scroll position reaches the last virtual one exactly.
    expect((MAX_BODY_PX - 400) * scale.ratio).toBeCloseTo(28_000_000 - 400, 3);
  });

  it("does not scale a body shorter than its viewport", () => {
    expect(bodyScale(3, 28, 400).ratio).toBe(1);
    expect(bodyScale(0, 28, 400).physicalHeight).toBe(0);
  });
});

describe("rowWindow", () => {
  it("renders the rows meeting the viewport plus overscan", () => {
    expect(rowWindow(0, 280, 28, 1000, 4)).toEqual({ start: 0, end: 14 });
    expect(rowWindow(2800, 280, 28, 1000, 4)).toEqual({ start: 96, end: 114 });
  });

  it("includes a row the viewport only partly shows", () => {
    expect(rowWindow(14, 28, 28, 1000, 0)).toEqual({ start: 0, end: 2 });
  });

  it("clamps at the last row", () => {
    expect(rowWindow(27_999_600, 400, 28, 1_000_000, 4)).toEqual({
      start: 999_981,
      end: 1_000_000,
    });
    expect(rowWindow(99_999, 280, 28, 10, 2)).toEqual({ start: 7, end: 10 });
  });

  it("renders nothing for an empty result or an unmeasured viewport", () => {
    expect(rowWindow(0, 280, 28, 0, 4)).toEqual({ start: 0, end: 0 });
    expect(rowWindow(0, 0, 28, 10, 4)).toEqual({ start: 0, end: 0 });
  });
});

describe("columnWindow", () => {
  const offsets = columnOffsets([100, 50, 200, 80, 120]);

  it("records each left edge and the total width", () => {
    expect(offsets).toEqual([0, 100, 150, 350, 430, 550]);
  });

  it("finds the columns meeting the viewport", () => {
    expect(columnWindow(offsets, 0, 120, 0)).toEqual({ start: 0, end: 2 });
    expect(columnWindow(offsets, 150, 200, 0)).toEqual({ start: 2, end: 3 });
    expect(columnWindow(offsets, 149, 202, 0)).toEqual({ start: 1, end: 4 });
  });

  it("widens by overscan and clamps at both ends", () => {
    expect(columnWindow(offsets, 360, 1000, 1)).toEqual({ start: 2, end: 5 });
    expect(columnWindow(offsets, 0, 50, 2)).toEqual({ start: 0, end: 3 });
  });

  it("renders nothing without columns", () => {
    expect(columnWindow(columnOffsets([]), 0, 500, 1)).toEqual({ start: 0, end: 0 });
  });
});

describe("reveal", () => {
  it("leaves a span already in view where it is", () => {
    expect(reveal(100, 300, 150, 200)).toBe(100);
  });

  it("scrolls back to a span above or left of the viewport", () => {
    expect(reveal(100, 300, 40, 68)).toBe(40);
  });

  it("scrolls forward just far enough for a span past the viewport", () => {
    expect(reveal(100, 300, 420, 448)).toBe(148);
  });

  it("shows the start of a span larger than the viewport", () => {
    expect(reveal(0, 300, 500, 1200)).toBe(500);
  });
});
