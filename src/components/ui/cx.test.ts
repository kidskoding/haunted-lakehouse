import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("joins classes and drops falsy ones", () => {
    expect(cx("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });

  it("returns an empty string for nothing", () => {
    expect(cx()).toBe("");
  });
});
