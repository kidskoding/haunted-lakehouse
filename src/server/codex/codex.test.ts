import { afterEach, describe, expect, it, vi } from "vitest";
import { NARRATIVE_PACKS } from "../narrative/packs";
import { plainText } from "../narrative/render";
import { currentPlayerId } from "../session/session";
import { codexEntries, CODEX_SIZE, loadCodex, writtenCount } from "./codex";
import type { EarnedClear } from "./earned";

vi.mock("../session/session", () => ({ currentPlayerId: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const PORCH: EarnedClear = {
  puzzleId: "porch-lights",
  seed: "raven-pumpkin-13",
  character: "intern",
  curse: null,
  candles: 4,
};

/** Every autopsy template's opening words, which name the technique. */
const AUTOPSY_TEXT = NARRATIVE_PACKS.flatMap(({ autopsy }) => [
  autopsy.title,
  autopsy.idea.slice(0, 40),
  ...autopsy.search,
]);

describe("codexEntries", () => {
  it("locks every registered hour for a player who has cleared none, in the order of the night", () => {
    const entries = codexEntries([]);
    expect(entries).toEqual([
      { puzzleId: "porch-lights", title: "Porch Lights", time: "6:00pm", kind: "locked" },
      { puzzleId: "thirteenth-door", title: "The Thirteenth Door", time: "6:45pm", kind: "locked" },
      { puzzleId: "possessed-feed", title: "The Possessed Feed", time: "7:30pm", kind: "locked" },
    ]);
    expect(CODEX_SIZE).toBe(3);
  });

  it("never lets an unearned autopsy's words leave the server", () => {
    const shipped = JSON.stringify(codexEntries([PORCH]).filter((e) => e.kind === "locked"));
    for (const text of AUTOPSY_TEXT) expect(shipped).not.toContain(text);
  });

  it("writes an earned autopsy with the numbers of the night it was cleared on", () => {
    const [porch] = codexEntries([PORCH]);
    if (porch?.kind !== "written") throw new Error("Porch Lights should be written.");
    expect(porch.seed).toBe("raven-pumpkin-13");
    expect(plainText(porch.autopsy.title)).toBe("Event logs are not state");
    expect(porch.autopsy.town.some((segment) => segment.kind === "value")).toBe(true);

    const other = codexEntries([{ ...PORCH, seed: "moth-lantern-7" }])[0];
    if (other?.kind !== "written") throw new Error("Porch Lights should be written.");
    expect(plainText(other.autopsy.town)).not.toBe(plainText(porch.autopsy.town));
  });

  it("lifts the fog once an hour is cleared, and renders every curse's night", () => {
    const curses = [null, "fog", "possession", "short-memory", "darkness"] as const;
    for (const puzzleId of ["thirteenth-door", "possessed-feed"]) {
      for (const curse of curses) {
        const entry = codexEntries([{ ...PORCH, puzzleId, curse }]).find(
          (e) => e.puzzleId === puzzleId,
        );
        if (entry?.kind !== "written") throw new Error(`${puzzleId} should be written.`);
        const { title, town, tempting, idea, production } = entry.autopsy;
        const segments = [title, town, tempting, idea, production].flat();
        expect(segments.some((segment) => segment.kind === "fog")).toBe(false);
      }
    }
  });

  it("counts only registered puzzles toward the Codex", () => {
    expect(writtenCount([PORCH, { ...PORCH, puzzleId: "not-a-puzzle" }])).toBe(1);
  });
});

describe("loadCodex", () => {
  it("shows a visitor with no session every hour locked", async () => {
    vi.mocked(currentPlayerId).mockResolvedValueOnce(null);
    const entries = await loadCodex();
    expect(entries?.map((entry) => entry.kind)).toEqual(["locked", "locked", "locked"]);
  });

  it("says it couldn't be read, and logs why, when the session can't be read", async () => {
    const failure = new Error("session store unreachable");
    vi.mocked(currentPlayerId).mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadCodex()).resolves.toBeNull();
    expect(logged).toHaveBeenCalledWith("The Codex couldn't read this player's runs", failure);
  });
});
