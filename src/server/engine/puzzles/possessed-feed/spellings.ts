import "server-only";
import type { Rng } from "../../random";
import { weighted } from "../../world/town";
import type { Drop } from "./drops";

/** How a driver typed a quantity once the handhelds started sending text. */
export type SpellingKind = "digits" | "unit" | "word" | "dozen" | "vague";

export interface Spelling {
  readonly kind: SpellingKind;
  readonly text: string;
}

// prettier-ignore
const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty",
] as const;

const DOZENS = new Map([
  [6, "half a dozen"],
  [12, "a dozen"],
  [24, "two dozen"],
]);

const UNITS = ["pcs", "units"] as const;

/** What a driver types when he didn't count. None of these is a number. */
const VAGUE = ["lots", "some", "a few", "??", "see slip", ""] as const;

// Digits stay the most common, so a hurried look at the feed sees mostly numbers.
const WEIGHTS: readonly (readonly [SpellingKind, number])[] = [
  ["digits", 40],
  ["unit", 20],
  ["word", 20],
  ["dozen", 10],
  ["vague", 10],
];

const CAPITALIZED = 0.3;

function wordFor(quantity: number): string | undefined {
  return NUMBER_WORDS[quantity - 1];
}

function canSpell(kind: SpellingKind, quantity: number): boolean {
  if (kind === "word") return wordFor(quantity) !== undefined;
  if (kind === "dozen") return DOZENS.has(quantity);
  return true;
}

function spell(rng: Rng, kind: SpellingKind, quantity: number): string {
  switch (kind) {
    case "digits":
      return String(quantity);
    case "unit":
      return `${String(quantity)} ${rng.pick(UNITS)}`;
    case "word": {
      const word = wordFor(quantity) ?? String(quantity);
      return rng.float() < CAPITALIZED ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    }
    case "dozen":
      return DOZENS.get(quantity) ?? String(quantity);
    case "vague":
      return rng.pick(VAGUE);
  }
}

/** Which batch each drop lands in, and the windows the spelling guarantees cover. */
export interface SpellingPlan {
  readonly placed: readonly { readonly drop: Drop; readonly batch: number }[];
  /** The first batch whose quantities arrive as text. */
  readonly from: number;
  /** Every spelling kind shows up by the end of this batch. */
  readonly everyKindBy: number;
  /** The first batch the player never sees before running the night. */
  readonly hiddenFrom: number;
}

type Spellings = Map<string, Spelling>;

/** A count that a plain integer cast misses: units, words, or dozens. */
function isTrickyCount(spelling: Spelling | undefined): boolean {
  return spelling !== undefined && spelling.kind !== "digits" && spelling.kind !== "vague";
}

/**
 * Makes sure `kind` appears among `drops`, by respelling one drop that is plain digits. Only
 * the spelling changes, never the quantity, so the truth stays the truth. A window with no
 * drop that can take the spelling is left alone.
 */
function ensureKind(rng: Rng, spellings: Spellings, drops: readonly Drop[], kind: SpellingKind) {
  const present = drops.some((drop) => {
    const spelling = spellings.get(drop.dropId);
    // An empty vague value is hard to quote in a story, so a non-empty one must exist too.
    return spelling?.kind === kind && spelling.text !== "";
  });
  if (present) return;
  const candidates = drops.filter(
    (drop) => spellings.get(drop.dropId)?.kind === "digits" && canSpell(kind, drop.quantity),
  );
  if (candidates.length === 0) return;
  const drop = rng.pick(candidates);
  const text =
    kind === "vague" ? rng.pick(VAGUE.filter((v) => v !== "")) : spell(rng, kind, drop.quantity);
  spellings.set(drop.dropId, { kind, text });
}

/**
 * Makes sure the retype's own batch holds a count a strict cast misses, by respelling one of
 * its plain-digit drops, so a cast breaks at the first check after the text arrives. A batch
 * of nothing but shrugs gets one of them counted instead: a cast skips a shrug just as the
 * story does, so it would pass. The truth is read from the spellings afterwards, so it follows.
 */
function ensureTricky(rng: Rng, spellings: Spellings, drops: readonly Drop[]) {
  if (drops.some((drop) => isTrickyCount(spellings.get(drop.dropId)))) return;
  const digits = drops.filter((drop) => spellings.get(drop.dropId)?.kind === "digits");
  const pool = digits.length > 0 ? digits : drops;
  if (pool.length === 0) return;
  const drop = rng.pick(pool);
  const kind = rng.pick(
    (["unit", "word", "dozen"] as const).filter((k) => canSpell(k, drop.quantity)),
  );
  spellings.set(drop.dropId, { kind, text: spell(rng, kind, drop.quantity) });
}

/**
 * Gives one hidden drop a readable spelling the visible batches never showed, so mapping the
 * strings seen so far, rather than reading them by the story's rules, fails the last check.
 */
function ensureUnseen(rng: Rng, spellings: Spellings, plan: SpellingPlan) {
  const seen = new Set<string>();
  for (const { drop, batch } of plan.placed) {
    if (batch >= plan.hiddenFrom) continue;
    seen.add((spellings.get(drop.dropId)?.text ?? String(drop.quantity)).toLowerCase());
  }
  const hidden = plan.placed.filter((p) => p.batch >= plan.hiddenFrom).map((p) => p.drop);
  const isNew = (spelling: Spelling | undefined) =>
    isTrickyCount(spelling) && !seen.has(spelling?.text.toLowerCase() ?? "");
  if (hidden.some((drop) => isNew(spellings.get(drop.dropId)))) return;

  const digits = hidden.filter((drop) => spellings.get(drop.dropId)?.kind === "digits");
  // Start at a seeded drop so the respelled one is not always the earliest.
  const start = digits.length > 0 ? rng.int(0, digits.length) : 0;
  for (let i = 0; i < digits.length; i++) {
    const drop = digits[(start + i) % digits.length];
    if (!drop) continue;
    const n = String(drop.quantity);
    const options: Spelling[] = [
      ...(canSpell("word", drop.quantity)
        ? [{ kind: "word" as const, text: spell(rng, "word", drop.quantity) }]
        : []),
      ...(canSpell("dozen", drop.quantity)
        ? [{ kind: "dozen" as const, text: spell(rng, "dozen", drop.quantity) }]
        : []),
      ...UNITS.map((unit) => ({ kind: "unit" as const, text: `${n} ${unit}` })),
    ];
    const fresh = options.find(isNew);
    if (fresh) {
      spellings.set(drop.dropId, fresh);
      return;
    }
  }
}

/**
 * The text each drop's quantity arrives as from the retype on, keyed by drop id. Mostly a
 * seeded mix by the weights above, then nudged so the possession is visible before the eight
 * o'clock check, a strict cast fails in the retype's own batch, and the hidden batches still
 * hold surprises.
 */
export function assignSpellings(plan: SpellingPlan, rng: (...labels: string[]) => Rng): Spellings {
  const draw = rng("spellings");
  const spellings: Spellings = new Map();
  for (const { drop, batch } of plan.placed) {
    if (batch < plan.from) continue;
    const drawn = weighted(draw, WEIGHTS);
    const kind = canSpell(drawn, drop.quantity) ? drawn : "digits";
    spellings.set(drop.dropId, { kind, text: spell(draw, kind, drop.quantity) });
  }

  const retyped = plan.placed.filter((p) => p.batch === plan.from).map((p) => p.drop);
  // Its own stream, so the guarantees drawn below keep their draws. It runs first because it
  // may respell a shrug, and the early guarantees then still promise one.
  ensureTricky(rng("spellings", "retype"), spellings, retyped);
  const fix = rng("spellings", "guarantees");
  const early = plan.placed
    .filter((p) => p.batch >= plan.from && p.batch <= plan.everyKindBy)
    .map((p) => p.drop);
  for (const kind of ["unit", "word", "dozen", "vague"] as const) {
    ensureKind(fix, spellings, early, kind);
  }
  const hidden = plan.placed.filter((p) => p.batch >= plan.hiddenFrom).map((p) => p.drop);
  ensureKind(fix, spellings, hidden, "vague");
  ensureUnseen(fix, spellings, plan);
  return spellings;
}

/** Whether a drop's quantity can be counted: always, unless the driver typed a shrug. */
export function isCountable(spelling: Spelling | undefined): boolean {
  return spelling?.kind !== "vague";
}
