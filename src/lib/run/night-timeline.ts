/*
 * The Run the night timeline as plain data: the hour's schedule as the client knows it, the
 * events its own executor yielded, and the server's verdict, turned into the beats the
 * animation plays. Nothing here imports server code, so client components can use it.
 */

import type { NightEvent, RuntimeError } from "../executor/types";

export interface NightBatchView {
  readonly index: number;
  /** When it lands, as the town's clocks show it: `7:15pm`. */
  readonly arrivesAt: string;
  /** Hidden from the player until this night ran. */
  readonly hidden: boolean;
}

export interface NightCheckpointView {
  readonly id: string;
  readonly afterBatch: number;
  /** When the town reads gold, as the story shows it: `8:00pm`. */
  readonly label: string;
}

/** The hour's schedule: every batch in index order, its checkpoints, and the replay batch. */
export interface NightSchedule {
  readonly batches: readonly NightBatchView[];
  readonly checkpoints: readonly NightCheckpointView[];
  readonly replayBatch: number | null;
}

/**
 * Where the server says the night first broke. It names the first checkpoint the night did not
 * pass and the batch it reveals, never why.
 */
export type NightVerdict =
  | { readonly survived: true }
  | { readonly survived: false; readonly checkpointId: string; readonly revealedBatch: number };

/** One moment of the animation, in timeline order. */
export type NightBeat =
  | { readonly kind: "batch"; readonly batch: number; readonly outcome: "landed" | "broke" }
  | {
      readonly kind: "replay";
      readonly batch: number;
      readonly outcome: "held" | "flinched" | "broke";
    }
  | {
      readonly kind: "checkpoint";
      readonly checkpointId: string;
      readonly batch: number;
      readonly outcome: "passed" | "cracked" | "broke";
    };

export interface NightTimeline {
  readonly beats: readonly NightBeat[];
  /** The beat the night froze on, or null when it ran to the end. */
  readonly failure: NightBeat | null;
  /** The runtime error that stopped the night, when one did. */
  readonly error: RuntimeError | null;
}

function changed(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
) {
  return Object.keys(before).some((table) => before[table] !== after[table]);
}

/**
 * The beats of a night, walked along the hour's schedule and stopped at the first failure
 * (runtime contract 7.3): a runtime error at the batch and phase it struck, a replay that
 * changed gold, or the checkpoint the verdict names. A schedule slot with no event, which a
 * night the server accepted never has, ends the timeline there.
 */
export function nightTimeline(
  schedule: NightSchedule,
  events: readonly NightEvent[],
  verdict: NightVerdict,
): NightTimeline {
  const last = events.at(-1);
  const error = last?.kind === "error" ? last.error : null;
  const checkpoints = new Map<string, NightEvent>();
  const replays = new Map<number, NightEvent>();
  for (const event of events) {
    if (event.kind === "checkpoint") checkpoints.set(event.checkpointId, event);
    if (event.kind === "replay") replays.set(event.batch, event);
  }

  const beats: NightBeat[] = [];
  const stop = (beat: NightBeat): NightTimeline => {
    beats.push(beat);
    return { beats, failure: beat, error };
  };
  const strikes = (batch: number, phase: RuntimeError["phase"]) =>
    error !== null && error.batch === batch && error.phase === phase;

  for (const { index: batch } of schedule.batches) {
    if (strikes(batch, "step")) return stop({ kind: "batch", batch, outcome: "broke" });
    beats.push({ kind: "batch", batch, outcome: "landed" });

    if (schedule.replayBatch === batch) {
      if (strikes(batch, "replay")) return stop({ kind: "replay", batch, outcome: "broke" });
      const replay = replays.get(batch);
      if (replay?.kind !== "replay") return { beats, failure: null, error };
      if (!verdict.survived && changed(replay.before, replay.after)) {
        return stop({ kind: "replay", batch, outcome: "flinched" });
      }
      beats.push({ kind: "replay", batch, outcome: "held" });
    }

    for (const { id: checkpointId, afterBatch } of schedule.checkpoints) {
      if (afterBatch !== batch) continue;
      if (!checkpoints.has(checkpointId)) {
        if (strikes(batch, "checkpoint")) {
          return stop({ kind: "checkpoint", checkpointId, batch, outcome: "broke" });
        }
        return { beats, failure: null, error };
      }
      // The server names the last checkpoint for an error after it, so the batch tells a
      // crack from a checkpoint that stood in for a later failure.
      if (
        !verdict.survived &&
        verdict.checkpointId === checkpointId &&
        verdict.revealedBatch === afterBatch
      ) {
        return stop({ kind: "checkpoint", checkpointId, batch, outcome: "cracked" });
      }
      beats.push({ kind: "checkpoint", checkpointId, batch, outcome: "passed" });
    }
  }
  return { beats, failure: null, error };
}

const CLOCK_TEXT = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i;

/**
 * Where a clock time such as `7:15pm` sits on a 12-hour dial, in hours (7.25). Null when the
 * text is not a clock time.
 */
export function dialHour(text: string): number | null {
  const match = CLOCK_TEXT.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  return (hours % 12) + minutes / 60;
}

/** How long each beat holds before the next, in milliseconds. A batch lands over `scene`. */
export const BEAT_MS = { batch: 900, replay: 1400, checkpoint: 1400 } as const;
