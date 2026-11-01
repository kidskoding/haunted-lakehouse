import type { CompiledModel, CompiledPipeline } from "../pipeline/compile";
import type { SqlConnection } from "./connection";
import { execute, type ExecutionOptions } from "./execute";
import type {
  ExpectedHashes,
  NightBatch,
  NightCheckpoint,
  NightEvent,
  NightFailure,
  RuntimeError,
} from "./types";

export interface PreviewInput {
  readonly pipeline: CompiledPipeline;
  /** The batches visible to the player, in index order. Hidden batches are simply absent. */
  readonly batches: readonly NightBatch[];
  readonly retention: number;
  /** The replay batch, when the player can see it. */
  readonly replayBatch?: number | null;
}

export interface PreviewResult {
  /** The indices of the batches fully run, in order. */
  readonly completed: readonly number[];
  /** The runtime error that stopped the preview, if any; the database stays as it reached. */
  readonly error: RuntimeError | null;
}

/**
 * Preview (runtime contract 9.1): replays the visible batches through the pipeline and leaves
 * the database for the player to explore. It never hashes gold or judges anything.
 */
export async function runPreview(
  connection: SqlConnection,
  input: PreviewInput,
  options: ExecutionOptions = {},
): Promise<PreviewResult> {
  const execution = execute(
    connection,
    {
      pipeline: input.pipeline,
      batches: input.batches,
      retention: input.retention,
      replayBatch: input.replayBatch ?? null,
      observe: null,
    },
    options,
  );
  for await (const event of execution) {
    if (event.kind === "error") {
      const completed = input.batches
        .map((batch) => batch.index)
        .filter((index) => index < event.error.batch);
      return { completed, error: event.error };
    }
  }
  return { completed: input.batches.map((batch) => batch.index), error: null };
}

export interface NightInput {
  readonly pipeline: CompiledPipeline;
  /** Every batch of the hour, visible and hidden: batches `0..B-1`. */
  readonly batches: readonly NightBatch[];
  readonly checkpoints: readonly NightCheckpoint[];
  readonly retention: number;
  /** The gold tables the hour checks, as `schema.name` (the puzzle's `goldTables`). */
  readonly goldTables: readonly string[];
  readonly replayBatch?: number | null;
}

export interface NightOptions extends ExecutionOptions {
  /**
   * Expected hashes, for callers that know them (the server and puzzle tests). With them the
   * night stops at its first failure. The browser never has them, so it runs to the end and
   * submits every event for the server to judge.
   */
  readonly expected?: ExpectedHashes;
}

export type NightResult =
  | { readonly started: true; readonly events: readonly NightEvent[] }
  /** Refused at no cost: these gold tables have no active model. */
  | { readonly started: false; readonly missingGold: readonly string[] };

/**
 * The active gold models for the hour's gold tables, and the tables no active model builds.
 * A night with any missing is refused before it starts, so callers check this before asking
 * the server for the hidden batches.
 */
export function goldModels(
  pipeline: CompiledPipeline,
  goldTables: readonly string[],
): { readonly gold: readonly CompiledModel[]; readonly missingGold: readonly string[] } {
  const byId = new Map(pipeline.models.map((model) => [model.id, model]));
  const gold: CompiledModel[] = [];
  const missingGold: string[] = [];
  for (const id of goldTables) {
    const model = byId.get(id.toLowerCase());
    if (model?.active === true && model.schema === "gold") gold.push(model);
    else missingGold.push(id);
  }
  return { gold, missingGold };
}

/**
 * Run the night (runtime contract 9.2): delivers every batch, and collects every gold hash at
 * every checkpoint reached, the replay check, and any runtime error, in timeline order.
 */
export async function runNight(
  connection: SqlConnection,
  input: NightInput,
  options: NightOptions = {},
): Promise<NightResult> {
  input.batches.forEach((batch, i) => {
    if (batch.index !== i) throw new RangeError("Run the night delivers batches 0..B-1 in order.");
  });
  const { gold, missingGold } = goldModels(input.pipeline, input.goldTables);
  if (missingGold.length > 0) return { started: false, missingGold };

  const events: NightEvent[] = [];
  const execution = execute(
    connection,
    {
      pipeline: input.pipeline,
      batches: input.batches,
      retention: input.retention,
      replayBatch: input.replayBatch ?? null,
      observe: { checkpoints: input.checkpoints, goldTables: gold },
    },
    options,
  );
  for await (const event of execution) {
    events.push(event);
    if (options.expected && judgeEvent(event, options.expected)) break;
  }
  return { started: true, events };
}

/** Whether one event breaks the night, and how. */
function judgeEvent(event: NightEvent, expected: ExpectedHashes): NightFailure | null {
  switch (event.kind) {
    case "error":
      return { kind: "error", error: event.error, revealedBatch: event.error.batch };
    case "replay": {
      const changed = Object.keys(event.before).some(
        (table) => event.before[table] !== event.after[table],
      );
      return changed ? { kind: "replay", revealedBatch: event.batch } : null;
    }
    case "checkpoint": {
      const wanted = expected[event.checkpointId] ?? {};
      const tables = Object.keys(event.hashes)
        .filter((table) => event.hashes[table] !== wanted[table])
        .sort();
      if (tables.length === 0) return null;
      return {
        kind: "checkpoint",
        checkpointId: event.checkpointId,
        label: event.label,
        tables,
        revealedBatch: event.afterBatch,
      };
    }
  }
}

/**
 * The verdict on a night's events (runtime contract 7.3): the first failure in timeline
 * order, or null when the night survived. Nothing after the first failure counts.
 */
export function judgeNight(
  events: readonly NightEvent[],
  expected: ExpectedHashes,
): NightFailure | null {
  for (const event of events) {
    const failure = judgeEvent(event, expected);
    if (failure) return failure;
  }
  return null;
}
