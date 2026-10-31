import { describe, expect, it } from "vitest";
import { ALL_PUZZLES } from "../engine/puzzles";
import { PERSONAS } from "./bindings";
import { narrativePack } from "./packs";
import { deathFromQuery, tombstonePaths, tombstoneQuery } from "./tombstone-link";
import {
  ANONYMOUS_HANDLE,
  DAILY_EPITAPH,
  OLD_WREN_EPITAPH,
  tombstone,
  type Death,
} from "./tombstones";

const death: Death = {
  handle: null,
  character: "intern",
  seed: "raven-pumpkin-13",
  slot: 3,
  act: 1,
  puzzleId: "possessed-feed",
  failedCheckpoint: { label: "19:45" },
  daily: false,
  progress: { runsFinished: 0, endingsSeen: [], pagesHeld: [] },
};

const VALID = tombstoneQuery(death);

function withParam(key: string, value: string | null): URLSearchParams {
  const params = new URLSearchParams(VALID);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return params;
}

describe("shared tombstones", () => {
  it("carries a death to a stone engraved exactly as the run's own", () => {
    for (const variant of [
      death,
      { ...death, handle: "kidskoding", character: "night_clerk" as const },
      { ...death, daily: true },
      { ...death, character: "old_wren" as const, slot: 1 as const, puzzleId: "porch-lights" },
    ]) {
      const shared = deathFromQuery(new URLSearchParams(tombstoneQuery(variant)));
      expect(shared).not.toBeNull();
      if (shared) expect(tombstone(shared)).toEqual(tombstone(variant));
    }
  });

  it("takes the slot and act from the hour, not from the link", () => {
    expect(deathFromQuery(new URLSearchParams(VALID))).toMatchObject({ slot: 3, act: 1 });
  });

  it("engraves the epitaph on the server, whatever the link says", () => {
    const params = new URLSearchParams(VALID);
    params.set("epitaph", "Anything at all.");
    const shared = deathFromQuery(params);
    expect(shared && tombstone(shared).epitaph).toBe(tombstone(death).epitaph);
    expect(shared && tombstone({ ...shared, daily: true }).epitaph).toBe(DAILY_EPITAPH);
    expect(shared && tombstone({ ...shared, character: "old_wren" }).epitaph).toBe(
      OLD_WREN_EPITAPH,
    );
  });

  it("points the share page and its image at the same death", () => {
    expect(tombstonePaths(death)).toEqual({
      share: `/tombstone?${VALID}`,
      image: `/tombstone/image?${VALID}`,
    });
    expect(tombstone(death).handle).toBe(ANONYMOUS_HANDLE);
  });

  it.each<[string, string, string | null]>([
    ["a seed the game can't draw", "seed", "raven-pumpkin-100"],
    ["a seed with markup in it", "seed", "<b>raven</b>-pumpkin-13"],
    ["a missing seed", "seed", null],
    ["an unknown character", "character", "the_mayor"],
    ["a character from the prototype", "character", "toString"],
    ["an hour no run can play", "hour", "seance"],
    ["a missing hour", "hour", null],
    ["a time after the night", "at", "04:00"],
    ["a 1am that won't say which", "at", "01:30"],
    ["a missing time", "at", null],
    ["a handle GitHub wouldn't issue", "handle", "-not--a-login"],
    ["a handle with spaces", "handle", "Free candy"],
    ["a daily flag that isn't one", "daily", "yes"],
    ["a hollow flag that isn't one", "hollow", "true"],
  ])("refuses %s", (_, key, value) => {
    expect(deathFromQuery(withParam(key, value))).toBeNull();
  });

  it("refuses a parameter given twice", () => {
    const params = new URLSearchParams(VALID);
    params.append("seed", "ghoul-gourd-2");
    expect(deathFromQuery(params)).toBeNull();
  });

  it("only names the Hollow on an Act III stone", () => {
    const shared = deathFromQuery(withParam("hollow", "1"));
    expect(shared && tombstone(shared).hollowYear).toBe(false);
  });
});

describe("the share card's fonts", () => {
  // The card's fonts are cut to printable ASCII (src/app/_og), so every line a shareable stone
  // can carry must stay inside it, or the card prints missing glyphs.
  const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

  it("cover every hour, epitaph, and character a run can die with", () => {
    const lines = [
      ...ALL_PUZZLES.flatMap(({ id }) => [narrativePack(id).title, ...narrativePack(id).epitaphs]),
      ...Object.values(PERSONAS).map(({ title }) => title),
      ANONYMOUS_HANDLE,
      DAILY_EPITAPH,
      OLD_WREN_EPITAPH,
      tombstone(death).wentOut,
      tombstone({ ...death, failedCheckpoint: { label: "01:30-06:00" } }).wentOut,
    ];
    for (const line of lines) expect(line).toMatch(PRINTABLE_ASCII);
  });
});
