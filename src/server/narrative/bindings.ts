import "server-only";
import type { Checkpoint } from "../engine/puzzle";
import type { CharacterId } from "../engine/run/types";
import { formatClock, listOf } from "./format";
import type { Speaker } from "./types";
import type { WrenStage } from "./wren";

/** Who is playing and how far the story has gone: everything that changes how the cast talks. */
export interface Voice {
  readonly character: CharacterId;
  readonly stage: WrenStage;
}

/** Bound values, keyed by placeholder name. Numbers stay numbers until a format prints them. */
export type Bindings = Readonly<Record<string, string | number>>;

/**
 * Placeholders every line may use, filled from the run rather than the puzzle. `you` is
 * bound per line, because it depends on who is speaking.
 */
export const SHARED_BINDINGS = [
  "you",
  "clock",
  "checkpoint",
  "checkpoints",
  "last_checkpoint",
  "failed_checkpoint",
  "retention",
  "candles",
  "seed",
  "keeper_name",
  "character_title",
] as const;

interface Persona {
  readonly title: string;
  readonly keeperName: string;
  readonly fromMayor: string;
  readonly fromMarisol: string;
  /** Wren's word for the player, before and after she's named the Hollow. */
  readonly fromWren: readonly [early: string, late: string];
}

export const PERSONAS: Readonly<Record<CharacterId, Persona>> = {
  intern: {
    title: "The Intern",
    keeperName: "the new hire",
    fromMayor: "new hire",
    fromMarisol: "dear",
    fromWren: ["kid", "kid"],
  },
  night_clerk: {
    title: "The Night Clerk",
    keeperName: "the Night Clerk",
    fromMayor: "Clerk",
    fromMarisol: "Clerk",
    fromWren: ["Clerk", "Clerk"],
  },
  purist: {
    title: "The Purist",
    keeperName: "the Purist",
    fromMayor: "Consultant",
    fromMarisol: "the specialist",
    // Wren takes the Purist for one of the consultants until the Act II ending.
    fromWren: ["consultant", "Purist"],
  },
  old_wren: {
    title: "Old Wren",
    keeperName: "Wren",
    fromMayor: "Wren",
    fromMarisol: "Wren",
    fromWren: ["Wren", "Wren"],
  },
};

/** How a speaker addresses the player: `{you}`. Minor townsfolk follow the Mayor's lead. */
export function addressFor(speaker: Speaker, voice: Voice): string {
  const persona = PERSONAS[voice.character];
  switch (speaker) {
    case "wren": {
      const early = voice.stage === "W0" || voice.stage === "W1" || voice.stage === "W2";
      return persona.fromWren[early ? 0 : 1];
    }
    case "marisol":
      return persona.fromMarisol;
    case "mayor":
    case "thorne":
    case "moribund":
    case "narrator":
      return persona.fromMayor;
  }
}

export interface RunMoment {
  readonly seed: string;
  readonly character: CharacterId;
  readonly candles: number;
  /** The hour's bronze retention, in batches, after any curse. */
  readonly retention: number;
  readonly checkpoints: readonly Checkpoint[];
  /** The run clock's time, as a 24-hour checkpoint-style label. */
  readonly clock?: string;
  /** The checkpoint that broke, for lost-candle and death text. */
  readonly failedCheckpoint?: Checkpoint;
}

/** The shared bindings for one moment of a run, except `you`, which each line binds itself. */
export function runBindings(moment: RunMoment): Bindings {
  const times = moment.checkpoints.map((checkpoint) => formatClock(checkpoint.label));
  const first = times[0];
  const last = times.at(-1);
  if (first === undefined || last === undefined) throw new RangeError("An hour has checkpoints.");
  const persona = PERSONAS[moment.character];
  return {
    seed: moment.seed,
    candles: moment.candles,
    retention: moment.retention,
    checkpoint: first,
    checkpoints: listOf(times),
    last_checkpoint: last,
    keeper_name: persona.keeperName,
    character_title: persona.title,
    ...(moment.clock === undefined ? {} : { clock: formatClock(moment.clock) }),
    ...(moment.failedCheckpoint === undefined
      ? {}
      : { failed_checkpoint: formatClock(moment.failedCheckpoint.label) }),
  };
}
