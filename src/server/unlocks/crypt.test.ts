import { afterEach, describe, expect, it, vi } from "vitest";
import { currentPlayerId } from "../session/session";
import { cryptCountsFrom, loadCryptCounts } from "./crypt";
import { FRESH_UNLOCKS } from "./progress";

vi.mock("../session/session", () => ({ currentPlayerId: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cryptCountsFrom", () => {
  it("gives a new player the Intern and no pages", () => {
    expect(cryptCountsFrom(FRESH_UNLOCKS)).toEqual({
      characters: { held: 1, total: 4 },
      pages: { held: 0, total: 7 },
    });
  });

  it("counts unlocked characters and held pages", () => {
    expect(
      cryptCountsFrom({
        ...FRESH_UNLOCKS,
        characters: ["intern", "night_clerk"],
        fragments: ["page-1", "page-4", "page-6"],
      }),
    ).toEqual({ characters: { held: 2, total: 4 }, pages: { held: 3, total: 7 } });
  });
});

describe("loadCryptCounts", () => {
  it("leaves the numbers out and logs when the session can't be read", async () => {
    const failure = new Error("session store unreachable");
    vi.mocked(currentPlayerId).mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(loadCryptCounts()).resolves.toBeNull();
    expect(logged).toHaveBeenCalledWith("The Crypt couldn't read this player's unlocks", failure);
  });
});
