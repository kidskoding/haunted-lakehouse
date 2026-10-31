/** A raw cell as puzzle data delivers it (runtime contract 4.4). */
export type RawCell = string | number | boolean | null;

export type RawRow = Readonly<Record<string, RawCell>>;

/** One delivery of raw data, shaped like the puzzle engine's `Batch`. */
export interface NightBatch {
  /** The batch's true index in the hour, which `_batch` records even when batches are hidden. */
  readonly index: number;
  readonly feeds: Readonly<Record<string, readonly RawRow[]>>;
}

/** A moment the town reads gold, shaped like the puzzle engine's `Checkpoint`. */
export interface NightCheckpoint {
  readonly id: string;
  readonly afterBatch: number;
  readonly label: string;
}

/** Where in a batch an execution was when it failed (runtime contract 6.3). */
export type ExecutionPhase = "step" | "replay" | "checkpoint";

export type RuntimeErrorCode =
  /** DuckDB rejected the model's SQL or its data. */
  | "sql"
  | "missing_key_column"
  | "shape_mismatch"
  | "null_key"
  | "duplicate_key"
  | "row_limit"
  | "step_time_limit"
  | "execution_time_limit";

/**
 * An error that ended an execution. `model` is the `schema.name` of the model being stepped,
 * or of the gold table being read. `line` and `column` are 1-based positions in the model's
 * rendered SQL, present when DuckDB points at one.
 */
export interface RuntimeError {
  readonly code: RuntimeErrorCode;
  readonly batch: number;
  readonly model: string;
  readonly phase: ExecutionPhase;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/** The SHA-256 of each gold table's canonical text, keyed by `schema.name`. */
export type GoldHashes = Readonly<Record<string, string>>;

/** Something Run the night observed, in timeline order. */
export type NightEvent =
  | {
      readonly kind: "checkpoint";
      readonly checkpointId: string;
      readonly label: string;
      readonly afterBatch: number;
      readonly hashes: GoldHashes;
    }
  | {
      readonly kind: "replay";
      readonly batch: number;
      /** Gold after the normal step of the replay batch. */
      readonly before: GoldHashes;
      /** Gold after the same step ran again. */
      readonly after: GoldHashes;
    }
  | { readonly kind: "error"; readonly error: RuntimeError };

/** The expected hash of every gold table at every checkpoint, keyed by checkpoint id. */
export type ExpectedHashes = Readonly<Record<string, GoldHashes>>;

/** The first thing that broke the night (runtime contract 7.3). */
export type NightFailure =
  | {
      readonly kind: "checkpoint";
      readonly checkpointId: string;
      readonly label: string;
      /** The gold tables whose hash differed, never their expected rows. */
      readonly tables: readonly string[];
      readonly revealedBatch: number;
    }
  | { readonly kind: "replay"; readonly revealedBatch: number }
  | { readonly kind: "error"; readonly error: RuntimeError; readonly revealedBatch: number };
