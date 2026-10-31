import type { CompiledPipeline } from "../pipeline/compile";
import { renderWithMap, sourcePosition } from "../pipeline/render";
import { stepContext } from "./materialize";
import { judgeNight } from "./night";
import type {
  ExecutionPhase,
  ExpectedHashes,
  NightEvent,
  NightFailure,
  RuntimeError,
  RuntimeErrorCode,
} from "./types";

/**
 * A runtime error as the player sees it. `line` and `column` are 1-based positions in the model
 * file the player wrote, present when DuckDB pointed at a place and it maps back to the file.
 */
export interface ReportedError {
  readonly code: RuntimeErrorCode;
  readonly batch: number;
  /** The `schema.name` of the model being stepped, or of the gold table being read. */
  readonly model: string;
  /** The model's file, or null when the error names no model of the pipeline. */
  readonly path: string | null;
  readonly phase: ExecutionPhase;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Where the night broke, for the player (runtime contract 7.3): the first failure and the
 * batch it reveals. It says where, never why: a wrong answer names the checkpoint and the gold
 * tables that differed, never their expected hashes or rows.
 */
export type FailureReport =
  | {
      /** A gold table held the wrong answer when the town read it. */
      readonly kind: "checkpoint";
      readonly checkpoint: {
        readonly id: string;
        /** The checkpoint's time as the story shows it, such as `8:00pm`. */
        readonly label: string;
        readonly afterBatch: number;
      };
      readonly tables: readonly string[];
      readonly revealedBatch: number;
    }
  /** Gold changed when the replay batch ran a second time. */
  | { readonly kind: "replay"; readonly revealedBatch: number }
  /** A model failed to run. */
  | { readonly kind: "error"; readonly error: ReportedError; readonly revealedBatch: number };

/**
 * A runtime error with its position mapped from the rendered SQL back to the player's model
 * file. `firstBatch` is the first batch the execution delivered: batch 0 for Run the night,
 * the first visible batch for Preview.
 */
export function reportError(
  error: RuntimeError,
  pipeline: CompiledPipeline,
  firstBatch: number,
): ReportedError {
  const model = pipeline.models.find((candidate) => candidate.id === error.model);
  const reported: ReportedError = {
    code: error.code,
    batch: error.batch,
    model: error.model,
    path: model?.path ?? null,
    phase: error.phase,
    message: error.message,
  };
  if (!model || error.line === undefined || error.column === undefined) return reported;
  // Only an incremental model has state, and it has state on every step after its first: any
  // failure ends the execution, so a failed first step is never followed by another. The
  // replay reruns a step that already ran, so it always has state.
  const hasState =
    model.materialization === "incremental" &&
    (error.phase === "replay" || error.batch !== firstBatch);
  const rendered = renderWithMap(model.template, stepContext(model, hasState));
  const place = sourcePosition(rendered, model.source, {
    line: error.line,
    column: error.column,
  });
  return place ? { ...reported, ...place } : reported;
}

/** The player's report of a night's first failure, from `judgeNight`'s verdict. */
export function reportFailure(failure: NightFailure, pipeline: CompiledPipeline): FailureReport {
  switch (failure.kind) {
    case "checkpoint":
      return {
        kind: "checkpoint",
        checkpoint: {
          id: failure.checkpointId,
          label: failure.label,
          afterBatch: failure.revealedBatch,
        },
        tables: failure.tables,
        revealedBatch: failure.revealedBatch,
      };
    case "replay":
      return { kind: "replay", revealedBatch: failure.revealedBatch };
    case "error":
      return {
        kind: "error",
        error: reportError(failure.error, pipeline, 0),
        revealedBatch: failure.revealedBatch,
      };
  }
}

/**
 * Judges a night's events against the expected hashes and reports where it broke, or returns
 * null when the night survived.
 */
export function reportNight(
  events: readonly NightEvent[],
  expected: ExpectedHashes,
  pipeline: CompiledPipeline,
): FailureReport | null {
  const failure = judgeNight(events, expected);
  return failure ? reportFailure(failure, pipeline) : null;
}
