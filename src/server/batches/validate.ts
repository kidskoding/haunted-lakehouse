import "server-only";
import { judgeNight } from "../../lib/executor/night";
import { revealBatch } from "../../lib/executor/reveal";
import type {
  ExecutionPhase,
  ExpectedHashes,
  GoldHashes,
  NightEvent,
  RuntimeError,
  RuntimeErrorCode,
} from "../../lib/executor/types";
import { visibleIndices } from "../engine/batches/visibility";
import type { Checkpoint, Puzzle, PuzzleData } from "../engine/puzzle";
import type { OpenHourData } from "./hour";

const HASH = /^[0-9a-f]{64}$/;

const CODES: Readonly<Record<RuntimeErrorCode, true>> = {
  sql: true,
  missing_key_column: true,
  shape_mismatch: true,
  null_key: true,
  duplicate_key: true,
  row_limit: true,
  step_time_limit: true,
  execution_time_limit: true,
};

const PHASES: Readonly<Record<ExecutionPhase, true>> = {
  step: true,
  replay: true,
  checkpoint: true,
};

export type ValidateNightResult =
  | { readonly survived: true }
  | {
      readonly survived: false;
      /** The first checkpoint the night did not pass. */
      readonly checkpointId: string;
      readonly revealedBatch: number;
      /** Every batch the player can query after this failure. */
      readonly visible: readonly number[];
    };

type Slot =
  | { readonly kind: "replay"; readonly batch: number }
  | { readonly kind: "checkpoint"; readonly batch: number; readonly checkpoint: Checkpoint };

function isCode(value: unknown): value is RuntimeErrorCode {
  return typeof value === "string" && Object.hasOwn(CODES, value);
}

function isPhase(value: unknown): value is ExecutionPhase {
  return typeof value === "string" && Object.hasOwn(PHASES, value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseHashes(value: unknown): GoldHashes | null {
  if (!isRecord(value)) return null;
  const hashes: Record<string, string> = {};
  for (const [table, hash] of Object.entries(value)) {
    if (typeof hash !== "string") return null;
    hashes[table] = hash;
  }
  return hashes;
}

function parseError(value: unknown): RuntimeError | null {
  if (!isRecord(value)) return null;
  const { code, batch, model, phase, message, line, column } = value;
  if (!isCode(code) || !isPhase(phase)) return null;
  if (!isIndex(batch) || typeof model !== "string" || typeof message !== "string") return null;
  if ((line !== undefined && !isIndex(line)) || (column !== undefined && !isIndex(column))) {
    return null;
  }
  return {
    code,
    batch,
    model,
    phase,
    message,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
}

function parseEvent(value: unknown): NightEvent | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "checkpoint": {
      const { checkpointId, label, afterBatch } = value;
      const hashes = parseHashes(value.hashes);
      if (typeof checkpointId !== "string" || typeof label !== "string") return null;
      if (!isIndex(afterBatch) || !hashes) return null;
      return { kind: "checkpoint", checkpointId, label, afterBatch, hashes };
    }
    case "replay": {
      const before = parseHashes(value.before);
      const after = parseHashes(value.after);
      if (!isIndex(value.batch) || !before || !after) return null;
      return { kind: "replay", batch: value.batch, before, after };
    }
    case "error": {
      const error = parseError(value.error);
      return error ? { kind: "error", error } : null;
    }
    default:
      return null;
  }
}

/**
 * Reads the night events a client submitted (runtime contract 7.3), rebuilt field by field.
 * Null when anything is not shaped like a `NightEvent`.
 */
export function parseNightEvents(value: unknown): readonly NightEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: NightEvent[] = [];
  for (const item of value) {
    const event = parseEvent(item);
    if (!event) return null;
    events.push(event);
  }
  return events;
}

/** What the night observes, in the order `execute` yields it: replay, then checkpoints. */
function schedule(puzzle: Puzzle, data: PuzzleData): readonly Slot[] {
  return data.batches.flatMap(({ index: batch }): Slot[] => [
    ...(batch === puzzle.replayBatch ? [{ kind: "replay" as const, batch }] : []),
    ...data.checkpoints
      .filter((checkpoint) => checkpoint.afterBatch === batch)
      .map((checkpoint) => ({ kind: "checkpoint" as const, batch, checkpoint })),
  ]);
}

/** Exactly the hour's gold tables, each with a well-formed hash, so none can be left out. */
function isGold(hashes: GoldHashes, goldTables: readonly string[]): boolean {
  const tables = Object.keys(hashes);
  return (
    tables.length === goldTables.length &&
    goldTables.every((table) => HASH.test(hashes[table] ?? ""))
  );
}

function matches(event: NightEvent, slot: Slot, goldTables: readonly string[]): boolean {
  if (slot.kind === "replay") {
    return (
      event.kind === "replay" &&
      event.batch === slot.batch &&
      isGold(event.before, goldTables) &&
      isGold(event.after, goldTables)
    );
  }
  return (
    event.kind === "checkpoint" &&
    event.checkpointId === slot.checkpoint.id &&
    event.afterBatch === slot.checkpoint.afterBatch &&
    event.label === slot.checkpoint.label &&
    isGold(event.hashes, goldTables)
  );
}

/**
 * Whether the events are a timeline `execute` could have yielded for this hour: every
 * scheduled observation in order, cut short only by one runtime error at a point the night
 * can actually fail. This is what stops a client from claiming a break wherever it likes.
 */
function followsSchedule(events: readonly NightEvent[], puzzle: Puzzle, data: PuzzleData): boolean {
  const slots = schedule(puzzle, data);
  const last = events.at(-1);
  const error = last?.kind === "error" ? last.error : null;
  const observed = error ? events.slice(0, -1) : events;
  if (observed.length > slots.length) return false;
  const inOrder = observed.every((event, i) => {
    const slot = slots[i];
    return slot !== undefined && matches(event, slot, puzzle.goldTables);
  });
  if (!inOrder) return false;
  if (!error) return observed.length === slots.length;
  if (error.batch >= data.batches.length) return false;

  const before = slots.filter((slot) => slot.batch < error.batch).length;
  const at = slots.filter((slot) => slot.batch === error.batch);
  const replay = at.some((slot) => slot.kind === "replay") ? 1 : 0;
  switch (error.phase) {
    case "step":
      return observed.length === before;
    case "replay":
      return replay === 1 && observed.length === before;
    case "checkpoint":
      // Gold is read at each of the batch's checkpoints in turn; the error is at one of them.
      return observed.length >= before + replay && observed.length < before + at.length;
  }
}

/**
 * Judges a submitted night with the client's own rules (`judgeNight`, `revealBatch`), so the
 * server reveals the batch the player sees. Null when the events are not a timeline this
 * hour could produce; missing or malformed hashes are refused rather than judged.
 */
export function validateNight(
  open: OpenHourData,
  expected: ExpectedHashes,
  events: readonly NightEvent[],
): ValidateNightResult | null {
  const { puzzle, data } = open;
  if (!followsSchedule(events, puzzle, data)) return null;
  const failure = judgeNight(events, expected);
  if (!failure) return { survived: true };

  const at = events.findIndex((event) => judgeNight([event], expected) !== null);
  const passed = events.slice(0, at).filter((event) => event.kind === "checkpoint").length;
  // An error after the last checkpoint leaves none unpassed; the last one stands in for it.
  const checkpoint = data.checkpoints[Math.min(passed, data.checkpoints.length - 1)];
  if (!checkpoint) throw new Error(`${puzzle.id} has no checkpoints.`);
  return {
    survived: false,
    checkpointId: checkpoint.id,
    revealedBatch: failure.revealedBatch,
    visible: revealBatch(
      data.batches,
      visibleIndices(data, puzzle.visibleBatchCount, open.hour.revealed),
      failure,
    ),
  };
}
