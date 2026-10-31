/** How a model's result is stored between batches (runtime contract, section 5). */
export type Materialization = "view" | "table" | "incremental";

/** The schemas a player's model can live in. */
export type ModelSchema = "silver" | "gold";

/** Every compile error the model compiler can report. */
export type CompileErrorCode =
  | "too_many_models"
  | "model_too_large"
  | "invalid_path"
  | "duplicate_model"
  | "template_syntax"
  | "unknown_tag"
  | "leftover_delimiter"
  | "config_syntax"
  | "config_position"
  | "config_duplicate"
  | "config_argument"
  | "config_value"
  | "materialization_disabled"
  | "incremental_only"
  | "this_on_first_run"
  | "unknown_feed"
  | "syntax_error"
  | "not_a_query"
  | "no_query"
  | "multiple_statements"
  | "forbidden_function"
  | "table_function"
  | "invalid_reference"
  | "unknown_relation"
  | "cycle";

/**
 * A compile error in the player's project. `model` is the model's `schema.name`, or null for
 * errors about the project as a whole. `line` and `column` are 1-based positions in the model
 * file as the player wrote it, present when the error has a place in the file.
 */
export interface CompileError {
  readonly code: CompileErrorCode;
  readonly model: string | null;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Parses SQL with DuckDB and returns `json_serialize_sql`'s output as parsed JSON. Injected so
 * the compiler runs unchanged against DuckDB-WASM in the browser and native DuckDB in tests.
 */
export type SqlParser = (sql: string) => Promise<unknown>;
