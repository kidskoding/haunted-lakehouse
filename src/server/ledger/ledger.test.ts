import { afterEach, describe, expect, it, vi } from "vitest";
import { LEDGER_PAGES } from "../narrative/pages";
import { PAGE_IDS } from "../narrative/progress";
import { plainText } from "../narrative/render";
import { currentPlayerId } from "../session/session";
import { ledgerView, loadLedger } from "./ledger";

vi.mock("../session/session", () => ({ currentPlayerId: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

/** A few of a page's words, unstyled, which only a found page may carry. */
const words = (text: string) => text.replaceAll("*", "").slice(20, 60);

describe("ledgerView", () => {
  it("tears out every page for a player who holds none, in the order of the book", () => {
    const view = ledgerView([], []);
    expect(view.leaves).toEqual(
      ["I", "II", "III", "IV", "V", "VI", "VII"].map((numeral) => ({ kind: "torn", numeral })),
    );
    expect(view.closing).toBeNull();
  });

  it("never lets an unfound page's text leave the server", () => {
    const shipped = JSON.stringify(ledgerView(["page-3"], []));
    for (const id of PAGE_IDS) {
      const { text } = LEDGER_PAGES[id];
      if (id === "page-3") expect(shipped).toContain(words(text));
      else expect(shipped).not.toContain(words(text));
    }
    // Not even the year on the edge: the dates alone point at 2020.
    expect(shipped).not.toContain("2020");
  });

  it("writes a found page in full, in the book's place for it", () => {
    const leaf = ledgerView(["page-6", "page-1"], []).leaves[0];
    if (leaf?.kind !== "found") throw new Error("Page I should be found.");
    expect(leaf.page.numeral).toBe("I");
    expect(leaf.page.year).toBe(1891);
    expect(plainText(leaf.page.segments)).toBe(
      "Hallowe'en, 1891. Lamps lit on the Creek Road: 4. Callers: 2, the Thorne girls, who sang for it. Given: three apples; molasses taffy, lots. Kept by Eliza Wren.",
    );
  });

  it("has Wren point to the night ahead once all seven are found, and to it kept after", () => {
    const ahead = ledgerView(PAGE_IDS, ["act-1", "act-2", "act-3"]).closing;
    expect(ahead?.speaker).toBe("wren");
    expect(plainText(ahead?.segments ?? [])).toBe(
      "Seven pages. All of them. Tonight we finish it.",
    );
    const kept = ledgerView(PAGE_IDS, ["act-3", "true"]).closing;
    expect(plainText(kept?.segments ?? [])).toBe(
      "It's kept now. Tonight's just a night. Enjoy it.",
    );
  });
});

describe("loadLedger", () => {
  it("shows a visitor with no session an empty Ledger", async () => {
    vi.mocked(currentPlayerId).mockResolvedValueOnce(null);
    const view = await loadLedger();
    expect(view?.leaves.map((leaf) => leaf.kind)).toEqual(PAGE_IDS.map(() => "torn"));
    expect(view?.closing).toBeNull();
  });

  it("says it couldn't be read, and logs why, when the session can't be read", async () => {
    const failure = new Error("session store unreachable");
    vi.mocked(currentPlayerId).mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadLedger()).resolves.toBeNull();
    expect(logged).toHaveBeenCalledWith("The Ledger couldn't read this player's pages", failure);
  });
});
