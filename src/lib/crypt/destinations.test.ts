import { describe, expect, it } from "vitest";
import { CRYPT_DESTINATIONS, tallyLine } from "./destinations";

describe("tallyLine", () => {
  it("counts pages found", () => {
    expect(tallyLine("pages", { held: 0, total: 7 })).toBe("0 of 7 pages found");
    expect(tallyLine("pages", { held: 3, total: 7 })).toBe("3 of 7 pages found");
    expect(tallyLine("pages", { held: 7, total: 7 })).toBe("All 7 pages found");
  });

  it("counts autopsies written", () => {
    expect(tallyLine("autopsies", { held: 0, total: 3 })).toBe("0 of 3 written");
    expect(tallyLine("autopsies", { held: 3, total: 3 })).toBe("All 3 written");
  });

  it("counts characters unlocked", () => {
    expect(tallyLine("characters", { held: 1, total: 4 })).toBe("1 of 4 unlocked");
    expect(tallyLine("characters", { held: 4, total: 4 })).toBe("All 4 unlocked");
  });
});

describe("CRYPT_DESTINATIONS", () => {
  it("lists the five rooms of the Crypt, each under /crypt", () => {
    expect(CRYPT_DESTINATIONS.map((d) => d.id)).toEqual([
      "codex",
      "graveyard",
      "ledger",
      "characters",
      "daily",
    ]);
    for (const destination of CRYPT_DESTINATIONS) {
      expect(destination.href).toBe(`/crypt/${destination.id}`);
    }
  });
});
