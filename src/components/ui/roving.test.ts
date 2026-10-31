import { describe, expect, it } from "vitest";
import { nextRovingIndex } from "./roving";

const none = [false, false, false, false];

describe("nextRovingIndex", () => {
  it("steps right and left", () => {
    expect(nextRovingIndex(1, none, "ArrowRight")).toBe(2);
    expect(nextRovingIndex(1, none, "ArrowLeft")).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(nextRovingIndex(3, none, "ArrowRight")).toBe(0);
    expect(nextRovingIndex(0, none, "ArrowLeft")).toBe(3);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextRovingIndex(2, none, "Home")).toBe(0);
    expect(nextRovingIndex(0, none, "End")).toBe(3);
  });

  it("skips disabled items in every direction", () => {
    const disabled = [true, false, true, false];
    expect(nextRovingIndex(1, disabled, "ArrowRight")).toBe(3);
    expect(nextRovingIndex(3, disabled, "ArrowRight")).toBe(1);
    expect(nextRovingIndex(1, disabled, "ArrowLeft")).toBe(3);
    expect(nextRovingIndex(3, disabled, "Home")).toBe(1);
    expect(nextRovingIndex(1, [false, false, true, true], "End")).toBe(1);
  });

  it("stays on a lone enabled item", () => {
    expect(nextRovingIndex(2, [true, true, false, true], "ArrowRight")).toBe(2);
  });

  it("ignores other keys and lists with nothing enabled", () => {
    expect(nextRovingIndex(0, none, "Enter")).toBeUndefined();
    expect(nextRovingIndex(0, none, "ArrowDown")).toBeUndefined();
    expect(nextRovingIndex(0, [true, true], "ArrowRight")).toBeUndefined();
    expect(nextRovingIndex(0, [], "Home")).toBeUndefined();
  });
});
