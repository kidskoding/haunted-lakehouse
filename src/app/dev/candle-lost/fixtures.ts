import "server-only";
import type { CandleLostProps } from "@/components/run/candle-lost";
import type { CharacterId } from "@/server/engine/run/types";
import type { Checkpoint, Puzzle, PuzzleData } from "@/server/engine/puzzle";
import { ALL_PUZZLES } from "@/server/engine/puzzles";
import { generatePuzzle } from "@/server/engine/registry";
import { runBindings } from "@/server/narrative/bindings";
import { formatClock } from "@/server/narrative/format";
import { narrativePack } from "@/server/narrative/packs";
import { lostCandleScene } from "@/server/narrative/reactions";
import { renderScene } from "@/server/narrative/render";

const SEED = "raven-pumpkin-13";

export interface Specimen extends Omit<CandleLostProps, "onDismiss"> {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
}

function puzzle(id: string): Puzzle {
  const found = ALL_PUZZLES.find((entry) => entry.id === id);
  if (!found) throw new Error(`No puzzle ${id}.`);
  return found;
}

/** The first checkpoint that reads `batch` or later: the one a break at that batch fails. */
function checkpointAtOrAfter(data: PuzzleData, batch: number): Checkpoint {
  const found = data.checkpoints.find((checkpoint) => checkpoint.afterBatch >= batch);
  if (!found) throw new Error(`No checkpoint reads batch ${String(batch)}.`);
  return found;
}

interface Break {
  readonly puzzleId: string;
  readonly character: CharacterId;
  readonly candles: CandleLostProps["candles"];
  readonly attempt: number;
  readonly failed: (data: PuzzleData, source: Puzzle) => Checkpoint;
  /** The Mayor's "At 7:00pm I said …": the player's own number, here a stand-in. */
  readonly shownValue: number;
}

/** The cast's reaction to a break, rendered by the narrative engine as a run would. */
function reactionFor(spec: Break, data: PuzzleData, failed: Checkpoint, source: Puzzle) {
  const voice = { character: spec.character, stage: "W0" } as const;
  const scene = lostCandleScene({
    owner: narrativePack(spec.puzzleId).owner,
    seed: SEED,
    slot: source.slot,
    attempt: spec.attempt,
    candlesLeft: spec.candles.lit,
    cost: spec.candles.lost,
    stage: voice.stage,
  });
  const bindings = {
    ...runBindings({
      seed: SEED,
      character: spec.character,
      candles: spec.candles.lit,
      retention: source.retention,
      checkpoints: data.checkpoints,
      failedCheckpoint: failed,
    }),
    ...data.narrative,
    shown_value: spec.shownValue,
  };
  return renderScene(scene, { bindings, withheld: [] }, voice);
}

function wrongAnswer(spec: Break): Omit<Specimen, "id" | "title" | "caption"> {
  const source = puzzle(spec.puzzleId);
  const data = generatePuzzle(source, SEED);
  const failed = spec.failed(data, source);
  return {
    candles: spec.candles,
    failure: {
      kind: "checkpoint",
      checkpoint: {
        id: failed.id,
        label: formatClock(failed.label),
        afterBatch: failed.afterBatch,
      },
      tables: Object.keys(data.expected[failed.id] ?? {}).sort(),
      revealedBatch: failed.afterBatch,
    },
    alreadyVisible: failed.afterBatch < source.visibleBatchCount,
    reaction: reactionFor(spec, data, failed, source),
  };
}

function firstHidden(data: PuzzleData, source: Puzzle): Checkpoint {
  return checkpointAtOrAfter(data, source.visibleBatchCount);
}

/** A model that failed on the first hidden batch, with the executor's own wording. */
function errorAtHiddenBatch(): Omit<Specimen, "id" | "title" | "caption"> {
  const spec: Break = {
    puzzleId: "thirteenth-door",
    character: "intern",
    candles: { lit: 3, lost: 1, total: 4 },
    attempt: 0,
    failed: firstHidden,
    shownValue: 0,
  };
  const source = puzzle(spec.puzzleId);
  const data = generatePuzzle(source, SEED);
  const batch = source.visibleBatchCount;
  const failed = checkpointAtOrAfter(data, batch);
  const device = data.batches[batch]?.feeds["candy_bowls"]?.[0]?.["device_id"];
  if (device === undefined) throw new Error("The first hidden batch has no bowl reading.");
  return {
    candles: spec.candles,
    failure: {
      kind: "error",
      error: {
        code: "duplicate_key",
        batch,
        model: "silver.bowl_takings",
        path: "models/silver/bowl_takings.sql",
        phase: "step",
        message: `More than one row of this batch's output has the key (device_id) = (${String(device)}).`,
      },
      revealedBatch: batch,
    },
    alreadyVisible: false,
    reaction: reactionFor(spec, data, failed, source),
  };
}

/** One specimen per state the moment has, each from real generated data for the seed. */
export function candleLostSpecimens(): Specimen[] {
  return [
    {
      id: "hour",
      title: "An hour, one candle",
      caption: "Porch Lights breaks at a checkpoint on hidden data: the Night Clerk goes 3 to 2.",
      ...wrongAnswer({
        puzzleId: "porch-lights",
        character: "night_clerk",
        candles: { lit: 2, lost: 1, total: 3 },
        attempt: 0,
        failed: firstHidden,
        shownValue: 214,
      }),
    },
    {
      id: "boss",
      title: "A boss hour, two candles",
      caption: "The Possessed Feed costs double: 3 to 1, and Wren counts what is left.",
      ...wrongAnswer({
        puzzleId: "possessed-feed",
        character: "night_clerk",
        candles: { lit: 1, lost: 2, total: 3 },
        attempt: 0,
        failed: firstHidden,
        shownValue: 1180,
      }),
    },
    {
      id: "error",
      title: "A model fails on a hidden batch",
      caption: "The Thirteenth Door's first hidden batch stops a model: the Intern goes 4 to 3.",
      ...errorAtHiddenBatch(),
    },
    {
      id: "visible",
      title: "Wrong on data already in bronze",
      caption:
        "The Thirteenth Door's bell checkpoint reads only visible batches; nothing new opens.",
      ...wrongAnswer({
        puzzleId: "thirteenth-door",
        character: "intern",
        candles: { lit: 2, lost: 1, total: 4 },
        attempt: 1,
        failed: (data) => checkpointAtOrAfter(data, 0),
        shownValue: 0,
      }),
    },
  ];
}
