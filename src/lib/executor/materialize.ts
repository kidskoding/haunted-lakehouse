import { quoteIdentifier, type DescribedColumn } from "../canonical/sql";
import type { CompiledModel } from "../pipeline/compile";
import { render } from "../pipeline/render";
import { countRows, describe, relationName, type SqlConnection } from "./connection";
import { StepFailure, asStepFailure, sqlFailure } from "./failure";

/** The schema of the executor's per-step scratch relations (runtime contract 3). */
export const SCRATCH = "__hl";

/** Runtime contract 10.2. */
export const MAX_MODEL_ROWS = 1_000_000;

const RESULT = relationName(SCRATCH, "result");
const STAGED = relationName(SCRATCH, "staged");

/** The relation `{{ new_batch('feed') }}` reads: the feed's rows of the current batch. */
export function newBatchRelation(feed: string): string {
  return relationName(SCRATCH, `new_batch_${feed.toLowerCase()}`);
}

export interface StepScope {
  readonly connection: SqlConnection;
  /** The columns of every incremental model's state, fixed by its first step. */
  readonly state: Map<string, readonly DescribedColumn[]>;
  /** Throws when a time limit has passed, so the step rolls back instead of committing. */
  readonly checkTime: () => void;
}

/**
 * Runs one model for one step with its materialization (runtime contract 5). The step is
 * atomic: on any failure the model's relation keeps what it held before, and the failure is
 * thrown as a `StepFailure`.
 */
export async function stepModel(scope: StepScope, model: CompiledModel): Promise<void> {
  const { connection } = scope;
  await connection.run("BEGIN TRANSACTION");
  let created: readonly DescribedColumn[] | null;
  try {
    created = await materialize(scope, model);
    scope.checkTime();
    await connection.run("COMMIT");
  } catch (error) {
    await connection.run("ROLLBACK");
    throw asStepFailure(error);
  }
  if (created) scope.state.set(model.id, created);
}

/** Returns the state's columns when this step created an incremental model's state. */
async function materialize(
  scope: StepScope,
  model: CompiledModel,
): Promise<readonly DescribedColumn[] | null> {
  const { connection } = scope;
  const relation = relationName(model.schema, model.name);
  const sql = render(model, {
    isIncremental: scope.state.has(model.id),
    thisRelation: relation,
    newBatchRelation,
  });
  switch (model.materialization) {
    case "view":
      await runModelSql(connection, `CREATE OR REPLACE VIEW ${relation} AS`, sql);
      return null;
    case "table":
      await runModelSql(connection, `CREATE OR REPLACE TABLE ${relation} AS`, sql);
      await checkRowLimit(connection, relation);
      return null;
    case "incremental": {
      const created = await mergeIncremental(scope, model, relation, sql);
      await checkRowLimit(connection, relation);
      return created;
    }
  }
}

/** Runs a statement that ends with the model's SQL on its own lines, so errors map onto it. */
async function runModelSql(connection: SqlConnection, head: string, sql: string): Promise<void> {
  try {
    await connection.run(`${head}\n${sql}`);
  } catch (error) {
    throw sqlFailure(error, sql, 1);
  }
}

async function checkRowLimit(connection: SqlConnection, relation: string): Promise<void> {
  const rows = await countRows(connection, relation);
  if (rows > MAX_MODEL_ROWS) {
    throw new StepFailure(
      "row_limit",
      `This model holds ${String(rows)} rows; a model holds at most ${String(MAX_MODEL_ROWS)}.`,
    );
  }
}

async function mergeIncremental(
  scope: StepScope,
  model: CompiledModel,
  relation: string,
  sql: string,
): Promise<readonly DescribedColumn[] | null> {
  const { connection } = scope;
  await runModelSql(connection, `CREATE OR REPLACE TABLE ${RESULT} AS`, sql);
  const result = await describe(connection, RESULT);
  const prior = scope.state.get(model.id);
  if (!prior) {
    const keys = keyColumns(model, result);
    await checkKeys(connection, RESULT, keys);
    await connection.run(`CREATE TABLE ${relation} AS SELECT * FROM ${RESULT}`);
    await connection.run(`DROP TABLE ${RESULT}`);
    return describe(connection, relation);
  }
  await connection.run(`CREATE OR REPLACE TABLE ${STAGED} AS ${castToState(prior, result)}`);
  const keys = keyColumns(model, prior);
  await checkKeys(connection, STAGED, keys);
  if (keys.length > 0) await connection.run(deleteReplaced(relation, keys));
  await connection.run(`INSERT INTO ${relation} SELECT * FROM ${STAGED}`);
  await connection.run(`DROP TABLE ${RESULT}`);
  await connection.run(`DROP TABLE ${STAGED}`);
  return null;
}

function byName(columns: readonly DescribedColumn[], name: string): DescribedColumn | undefined {
  const folded = name.toLowerCase();
  return columns.find((column) => column.name.toLowerCase() === folded);
}

/** The model's `unique_key` as the columns of `columns` it names. */
function keyColumns(model: CompiledModel, columns: readonly DescribedColumn[]): string[] {
  return (model.uniqueKey ?? []).map((key) => {
    const column = byName(columns, key);
    if (!column) {
      throw new StepFailure(
        "missing_key_column",
        `The unique_key column \`${key}\` is not in this model's output.`,
      );
    }
    return column.name;
  });
}

/**
 * A SELECT of the step's result in the state's column order and types. Incremental state
 * never changes shape, since there is no full refresh to fall back on once bronze forgets.
 */
function castToState(
  prior: readonly DescribedColumn[],
  result: readonly DescribedColumn[],
): string {
  const folded = (columns: readonly DescribedColumn[]) =>
    new Set(columns.map((column) => column.name.toLowerCase()));
  const priorNames = folded(prior);
  const resultNames = folded(result);
  const added = result.filter((c) => !priorNames.has(c.name.toLowerCase())).map((c) => c.name);
  const missing = prior.filter((c) => !resultNames.has(c.name.toLowerCase())).map((c) => c.name);
  if (added.length > 0 || missing.length > 0) {
    const list = (names: readonly string[]) =>
      [...names]
        .sort()
        .map((n) => `\`${n}\``)
        .join(", ");
    const parts = [
      ...(added.length > 0 ? [`it adds ${list(added)}`] : []),
      ...(missing.length > 0 ? [`it is missing ${list(missing)}`] : []),
    ];
    throw new StepFailure(
      "shape_mismatch",
      `This batch's output has different columns from the model's state: ${parts.join(" and ")}.`,
    );
  }
  const projections = prior.map((column) => {
    const source = byName(result, column.name)?.name ?? column.name;
    return `CAST(${quoteIdentifier(source)} AS ${column.type}) AS ${quoteIdentifier(column.name)}`;
  });
  return `SELECT ${projections.join(", ")} FROM ${RESULT}`;
}

async function checkKeys(
  connection: SqlConnection,
  relation: string,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  for (const key of keys) {
    const nulls = await countRows(
      connection,
      `(SELECT 1 FROM ${relation} WHERE ${quoteIdentifier(key)} IS NULL)`,
    );
    if (nulls > 0) {
      throw new StepFailure(
        "null_key",
        `${String(nulls)} ${nulls === 1 ? "row has" : "rows have"} NULL in the unique_key column \`${key}\`.`,
      );
    }
  }
  const quoted = keys.map(quoteIdentifier);
  const { rows } = await connection.query(
    `SELECT ${quoted.map((key) => `CAST(${key} AS VARCHAR)`).join(", ")} FROM ` +
      `(SELECT ${quoted.join(", ")} FROM ${relation} GROUP BY ALL HAVING count(*) > 1) ` +
      `ORDER BY ALL LIMIT 1`,
  );
  const duplicate = rows[0];
  if (duplicate) {
    const values = duplicate.map((value) => String(value)).join(", ");
    throw new StepFailure(
      "duplicate_key",
      `More than one row of this batch's output has the key (${keys.join(", ")}) = (${values}).`,
    );
  }
}

/** Deletes the state rows whose key the staged rows replace. */
function deleteReplaced(relation: string, keys: readonly string[]): string {
  const matches = keys
    .map((key) => `${STAGED}.${quoteIdentifier(key)} = ${relation}.${quoteIdentifier(key)}`)
    .join(" AND ");
  return `DELETE FROM ${relation} WHERE EXISTS (SELECT 1 FROM ${STAGED} WHERE ${matches})`;
}
