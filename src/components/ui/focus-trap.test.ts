import { describe, expect, it } from "vitest";
import { wrappedTabIndex } from "./focus-trap";

describe("wrappedTabIndex", () => {
  it("wraps Tab from the last element to the first", () => {
    expect(wrappedTabIndex(2, 3, false)).toBe(0);
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    expect(wrappedTabIndex(0, 3, true)).toBe(2);
  });

  it("leaves moves inside the trap to the browser", () => {
    expect(wrappedTabIndex(0, 3, false)).toBeUndefined();
    expect(wrappedTabIndex(2, 3, true)).toBeUndefined();
    expect(wrappedTabIndex(1, 3, false)).toBeUndefined();
  });

  it("enters from the container at the end Tab points to", () => {
    expect(wrappedTabIndex(-1, 3, false)).toBe(0);
    expect(wrappedTabIndex(-1, 3, true)).toBe(2);
  });

  it("keeps a single element focused", () => {
    expect(wrappedTabIndex(0, 1, false)).toBe(0);
    expect(wrappedTabIndex(0, 1, true)).toBe(0);
  });

  it("does nothing when nothing can take focus", () => {
    expect(wrappedTabIndex(-1, 0, false)).toBeUndefined();
  });
});
