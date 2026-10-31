import { quoteIdentifier, type DescribedColumn } from "../canonical/sql";
import type { CompiledModel, CompiledPipeline } from "../pipeline/compile";
import { BRONZE, BronzeFeed } from "./bronze";
import { relationName, type SqlConnection } from "./connection";
import { StepFailure, asStepFailure } from "./failure";
import { hashRelation } from "./gold";
import { SCRATCH, newBatchRelation, stepModel, type StepScope } from "./materialize";
import type {
  ExecutionPhase,
  GoldHashes,
  NightBatch,
  NightCheckpoint,
  NightEvent,
  RuntimeError,
} from "./types";

/** Runtime contract 10.2. */
export const STEP_TIME_LIMIT_MS = 10_000;
export const EXECUTION_TIME_LIMIT_MS = 120_000;

/** Runtime contract 10.1, applied before anything else runs. */
const SETTINGS = [
  "SET threads = 1",
  "SET preserve_insertion_order = true",
  "SET default_order = 'ASC'",
  "SET default_null_order = 'NULLS_LAST'",
  "SET TimeZone = 'UTC'",
];

export interface ExecutionOptions {
  /** Milliseconds from any fixed origin, for the time limits. Defaults to `performance.now`. */
  readonly now?: () => number;
}

export interface Execution {
  readonly pipeline: CompiledPipeline;
  /** The batches to deliver, in index order. */
  readonly batches: readonly NightBatch[];
  /** How many of the most recently delivered batches bronze keeps. */
  readonly retention: number;
  readonly replayBatch: number | null;
  /** What to hash and when. Null for Preview, which never hashes gold. */
  readonly observe: {
    readonly checkpoints: readonly NightCheckpoint[];
    readonly goldTables: readonly CompiledModel[];
  } | null;
}

/** Carries a reported runtime error out of a step to the end of the execution. */
class Failed extends Error {
  constructor(readonly error: RuntimeError) {
    super(error.message);
  }
}

function report(
  failure: StepFailure,
  batch: number,
  model: string,
  phase: ExecutionPhase,
): RuntimeError {
  return {
    code: failure.code,
    batch,
    model,
    phase,
    message: failure.message,
    ...(failure.position ?? {}),
  };
}

function checkBatches(batches: readonly NightBatch[], retention: number): void {
  if (!Number.isInteger(retention) || retention < 1) {
    throw new RangeError(`Retention must be a positive whole number of batches.`);
  }
  const feeds = Object.keys(batches[0]?.feeds ?? {})
    .sort()
    .join(",");
  batches.forEach((batch, i) => {
    const previous = batches[i - 1];
    if (previous && batch.index <= previous.index) {
      throw new RangeError("Batches must be delivered in increasing index order.");
    }
    if (Object.keys(batch.feeds).sort().join(",") !== feeds) {
      throw new RangeError(`Batch ${String(batch.index)} does not list the hour's feeds.`);
    }
  });
}

/**
 * One execution of an hour through a compiled pipeline (runtime contract 6), from an empty
 * database. Yields what it observes in timeline order: checkpoint hashes, replay checks, and
 * at most one runtime error, which ends it. The caller may stop early by leaving the loop.
 *
 * `connection` must be a fresh, empty DuckDB database: the execution turns off external
 * access, which cannot be turned back on.
 */
export async function* execute(
  connection: SqlConnection,
  execution: Execution,
  options: ExecutionOptions = {},
): AsyncGenerator<NightEvent, void, undefined> {
  const { pipeline, batches, retention, replayBatch, observe } = execution;
  checkBatches(batches, retention);
  const now = options.now ?? (() => performance.now());
  const started = now();

  for (const statement of SETTINGS) await connection.run(statement);
  for (const schema of [BRONZE, "silver", "gold", SCRATCH]) {
    await connection.run(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  }
  await connection.run("SET enable_external_access = false");

  const byId = new Map(pipeline.models.map((model) => [model.id, model]));
  const active = pipeline.order
    .map((id) => byId.get(id))
    .filter((model): model is CompiledModel => model?.active === true);
  const feeds = Object.keys(batches[0]?.feeds ?? {})
    .sort()
    .map((feed) => new BronzeFeed(feed));
  const delivered: number[] = [];
  const state = new Map<string, readonly DescribedColumn[]>();

  const runStep = async (batch: number, phase: ExecutionPhase): Promise<void> => {
    for (const model of active) {
      const stepStarted = now();
      const scope: StepScope = {
        connection,
        state,
        checkTime: () => {
          const at = now();
          if (at - stepStarted > STEP_TIME_LIMIT_MS) {
            throw new StepFailure(
              "step_time_limit",
              `This model's step ran longer than ${String(STEP_TIME_LIMIT_MS / 1000)} s.`,
            );
          }
          if (at - started > EXECUTION_TIME_LIMIT_MS) {
            throw new StepFailure(
              "execution_time_limit",
              `The night ran longer than ${String(EXECUTION_TIME_LIMIT_MS / 1000)} s.`,
            );
          }
        },
      };
      try {
        await stepModel(scope, model);
      } catch (error) {
        throw new Failed(report(asStepFailure(error), batch, model.id, phase));
      }
    }
  };

  const hashGold = async (batch: number, phase: ExecutionPhase): Promise<GoldHashes> => {
    const hashes: Record<string, string> = {};
    for (const model of observe?.goldTables ?? []) {
      try {
        hashes[model.id] = await hashRelation(connection, relationName(model.schema, model.name));
      } catch (error) {
        throw new Failed(report(asStepFailure(error), batch, model.id, phase));
      }
    }
    return hashes;
  };

  try {
    for (const batch of batches) {
      const k = batch.index;
      delivered.push(k);
      const kept = new Set(delivered.slice(-retention));
      for (const feed of feeds) {
        feed.land(k, batch.feeds[feed.feed] ?? []);
        feed.retain(kept);
        for (const statement of feed.statements()) await connection.run(statement);
        await connection.run(
          `CREATE OR REPLACE TABLE ${newBatchRelation(feed.feed)} AS ` +
            `SELECT * FROM ${feed.relation} WHERE "_batch" = ${String(k)}`,
        );
      }

      await runStep(k, "step");

      if (k === replayBatch) {
        const before = observe ? await hashGold(k, "replay") : null;
        await runStep(k, "replay");
        if (before) yield { kind: "replay", batch: k, before, after: await hashGold(k, "replay") };
      }

      for (const checkpoint of observe?.checkpoints ?? []) {
        if (checkpoint.afterBatch !== k) continue;
        yield {
          kind: "checkpoint",
          checkpointId: checkpoint.id,
          label: checkpoint.label,
          afterBatch: k,
          hashes: await hashGold(k, "checkpoint"),
        };
      }
    }
  } catch (error) {
    if (!(error instanceof Failed)) throw error;
    yield { kind: "error", error: error.error };
  }
}
