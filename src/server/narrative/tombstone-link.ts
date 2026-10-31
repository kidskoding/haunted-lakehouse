import "server-only";
import { ALL_PUZZLES } from "../engine/puzzles";
import type { CharacterId } from "../engine/run/types";
import { isHumanSeed } from "../engine/seed";
import { slotDefinition } from "../engine/slots";
import { PERSONAS } from "./bindings";
import { formatClock } from "./format";
import { tombstone, type Death } from "./tombstones";

/*
 * A shared stone travels as the facts of the death, never as its text: the server engraves
 * the epitaph and every line itself, so a link can't make the share card say anything the game
 * wouldn't. These are the only parameters a link may carry.
 */

// GitHub's rules for a login: letters, digits, and single inner hyphens, 39 characters at most.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** The query string that carries a death to the share page and its image. */
export function tombstoneQuery(death: Death): string {
  const params = new URLSearchParams({
    seed: death.seed,
    character: death.character,
    hour: death.puzzleId,
    at: death.failedCheckpoint.label,
  });
  if (death.handle !== null) params.set("handle", death.handle);
  if (death.daily) params.set("daily", "1");
  if (tombstone(death).hollowYear) params.set("hollow", "1");
  return params.toString();
}

/** Where a death's stone is shared, and the image its link previews with. */
export function tombstonePaths(death: Death): { readonly share: string; readonly image: string } {
  const query = tombstoneQuery(death);
  return { share: `/tombstone?${query}`, image: `/tombstone/image?${query}` };
}

function single(params: URLSearchParams, key: string): string | null | undefined {
  const values = params.getAll(key);
  if (values.length > 1) return undefined;
  return values[0] ?? null;
}

/** "1" is set, absent is unset, and anything else is a link someone edited. */
function flag(params: URLSearchParams, key: string): boolean | undefined {
  const value = single(params, key);
  if (value === null) return false;
  return value === "1" ? true : undefined;
}

function isCharacter(value: string): value is CharacterId {
  return Object.hasOwn(PERSONAS, value);
}

function isClock(value: string): boolean {
  try {
    formatClock(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/**
 * The death a shared link describes, or null when any part of it is not something a run could
 * have recorded: an unknown seed, character, or hour, a time off the night's clocks, a handle
 * GitHub wouldn't issue, or a repeated or garbled parameter.
 */
export function deathFromQuery(params: URLSearchParams): Death | null {
  const seed = single(params, "seed");
  const character = single(params, "character");
  const puzzle = ALL_PUZZLES.find(({ id }) => id === single(params, "hour"));
  const at = single(params, "at");
  const handle = single(params, "handle");
  const daily = flag(params, "daily");
  const hollow = flag(params, "hollow");

  if (!seed || !isHumanSeed(seed)) return null;
  if (!character || !isCharacter(character)) return null;
  if (!puzzle || !at || !isClock(at)) return null;
  if (handle === undefined || (handle !== null && !GITHUB_LOGIN.test(handle))) return null;
  if (daily === undefined || hollow === undefined) return null;

  return {
    handle,
    character,
    seed,
    slot: puzzle.slot,
    act: slotDefinition(puzzle.slot).act,
    puzzleId: puzzle.id,
    failedCheckpoint: { label: at },
    daily,
    // The stone reads one thing from a player's progress: whether the Hollow has a name yet.
    progress: { runsFinished: 0, endingsSeen: hollow ? ["act-2"] : [], pagesHeld: [] },
  };
}
