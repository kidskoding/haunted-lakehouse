import "server-only";
import { type Rng, rngFor } from "./random";

// A seed reads as an omen and a treat. Both lists are frozen: changing either one, even by
// appending, changes the seed every stream draws.
// prettier-ignore
const OMENS = [
  "raven", "ghoul", "wraith", "specter", "banshee", "goblin", "witch", "wolf",
  "bat", "spider", "crow", "owl", "moth", "skull", "bone", "shade",
  "phantom", "lantern", "candle", "cauldron", "coffin", "crypt", "grave", "hollow",
  "mist", "fog", "moon", "ember", "ash", "thorn", "hex", "wisp",
] as const;

// prettier-ignore
const TREATS = [
  "pumpkin", "gourd", "apple", "caramel", "toffee", "licorice", "taffy", "fudge",
  "cider", "nutmeg", "clove", "cinnamon", "maple", "acorn", "chestnut", "hayride",
  "scarecrow", "broom", "cobweb", "bonfire", "harvest", "turnip", "squash", "molasses",
  "peppermint", "marzipan", "nougat", "truffle", "praline", "brittle", "gumdrop", "candycorn",
] as const;

const MAX_NUMBER = 99;

const SEED_PATTERN = /^([a-z]+)-([a-z]+)-([1-9][0-9]?)$/;

/** A human-friendly run seed like `raven-pumpkin-13`, drawn from the given stream. */
export function humanSeed(rng: Rng): string {
  return `${rng.pick(OMENS)}-${rng.pick(TREATS)}-${String(rng.int(1, MAX_NUMBER + 1))}`;
}

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Daily Haunt's seed for a UTC date (`YYYY-MM-DD`): the same for every player that day, and
 * derived only from the date, so it never needs storing to be shared.
 */
export function dailySeed(date: string): string {
  if (!UTC_DATE.test(date)) throw new RangeError(`"${date}" is not a UTC date like 2026-10-31.`);
  return humanSeed(rngFor(["daily-haunt", date, 0]));
}

/** Whether a string is a seed this generator could have produced, for replays typed by hand. */
export function isHumanSeed(value: string): boolean {
  const match = SEED_PATTERN.exec(value);
  if (!match) return false;
  const [, omen = "", treat = ""] = match;
  return (
    (OMENS as readonly string[]).includes(omen) && (TREATS as readonly string[]).includes(treat)
  );
}
