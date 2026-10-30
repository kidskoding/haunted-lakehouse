import { describe, expect, it } from "vitest";
import { site } from "./site";

describe("site", () => {
  it("keeps the tagline short enough to show in full as a search result description", () => {
    expect(site.tagline.length).toBeLessThanOrEqual(155);
  });
});
