import { indexOfCodePointOffset, indexOfUtf8Offset } from "./position";
import type { CompileErrorCode } from "./types";

/** A schema-qualified relation a query reads, lowercased. `at` indexes the parsed SQL. */
export interface QueryRef {
  readonly schema: string;
  readonly name: string;
  readonly at: number | null;
}

/** A problem with a query. `at` indexes the parsed SQL, or is null when DuckDB gives no place. */
export interface QueryIssue {
  readonly code: CompileErrorCode;
  readonly message: string;
  readonly at: number | null;
}

export interface QueryAnalysis {
  readonly refs: readonly QueryRef[];
  readonly issues: readonly QueryIssue[];
}

/** The schemas a model may read (runtime contract 2.4). */
export const PIPELINE_SCHEMAS: ReadonlySet<string> = new Set(["bronze", "silver", "gold"]);

/**
 * Functions that would make a model's result change between runs. The runtime contract (2.5)
 * gives the base list; `uuidv4`, `uuidv7`, `current_query`, `getvariable`, and `txid_current`
 * are added because they vary just the same.
 */
const VOLATILE_FUNCTIONS: ReadonlySet<string> = new Set([
  "random",
  "setseed",
  "uuid",
  "uuidv4",
  "uuidv7",
  "gen_random_uuid",
  "nextval",
  "currval",
  "now",
  "current_timestamp",
  "current_date",
  "current_time",
  "get_current_time",
  "get_current_timestamp",
  "localtimestamp",
  "localtime",
  "today",
  "transaction_timestamp",
  "current_query",
  "getvariable",
  "txid_current",
]);

/**
 * Functions that reach outside the pipeline's relations. Contract 2.5 again, plus `getenv`,
 * `json_execute_serialized_sql` (it runs a query that skipped these checks), `which_secret`,
 * and the `pragma_*` catalog functions.
 */
const EXTERNAL_FUNCTIONS: ReadonlySet<string> = new Set([
  "glob",
  "sniff_csv",
  "query",
  "query_table",
  "delta_scan",
  "getenv",
  "json_execute_serialized_sql",
  "which_secret",
]);
const EXTERNAL_PREFIXES: readonly string[] = [
  "read_",
  "parquet_",
  "iceberg_",
  "duckdb_",
  "pragma_",
];
const CATALOG_SCHEMAS: ReadonlySet<string> = new Set(["information_schema", "pg_catalog"]);

/** SQL keywords DuckDB parses as column references and binds to clock functions. */
const CLOCK_KEYWORDS: ReadonlySet<string> = new Set([
  "current_date",
  "current_time",
  "current_timestamp",
  "localtime",
  "localtimestamp",
]);

type JsonObject = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(record: JsonObject, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function forbiddenReason(name: string): string | null {
  if (VOLATILE_FUNCTIONS.has(name)) return "its result changes from run to run";
  if (EXTERNAL_FUNCTIONS.has(name) || EXTERNAL_PREFIXES.some((p) => name.startsWith(p))) {
    return "it reaches outside the pipeline";
  }
  return null;
}

class Walker {
  readonly refs: QueryRef[] = [];
  readonly issues: QueryIssue[] = [];

  constructor(
    private readonly sql: string,
    private readonly ignoredSchemas: ReadonlySet<string>,
  ) {}

  /** DuckDB's "no location" is UINT64_MAX, past the end of any query, so it maps to null. */
  private at(record: JsonObject): number | null {
    const location = record.query_location;
    return typeof location === "number" ? indexOfUtf8Offset(this.sql, location) : null;
  }

  private issue(code: CompileErrorCode, message: string, record: JsonObject): void {
    this.issues.push({ code, message, at: this.at(record) });
  }

  walk(value: unknown, ctes: ReadonlySet<string>): void {
    if (Array.isArray(value)) {
      for (const item of value) this.walk(item, ctes);
      return;
    }
    if (!isRecord(value)) return;
    const scope = this.scope(value, ctes);
    switch (value.type) {
      case "BASE_TABLE":
        this.table(value, scope);
        break;
      case "TABLE_FUNCTION":
        this.tableFunction(value);
        return;
      case "SHOW_REF":
        this.issue(
          "not_a_query",
          "A model must be a query; DESCRIBE, SUMMARIZE, and SHOW are for exploring.",
          value,
        );
        return;
    }
    if (typeof value.function_name === "string") this.function(value);
    if (value.class === "COLUMN_REF") this.column(value);
    for (const child of Object.values(value)) this.walk(child, scope);
  }

  /** CTE names are in scope for the whole query that declares them, CTE bodies included. */
  private scope(record: JsonObject, ctes: ReadonlySet<string>): ReadonlySet<string> {
    const map = isRecord(record.cte_map) ? record.cte_map.map : undefined;
    if (!Array.isArray(map) || map.length === 0) return ctes;
    const names = new Set(ctes);
    for (const entry of map) {
      if (isRecord(entry) && typeof entry.key === "string") names.add(entry.key.toLowerCase());
    }
    return names;
  }

  private table(record: JsonObject, ctes: ReadonlySet<string>): void {
    const catalog = text(record, "catalog_name");
    const schema = text(record, "schema_name").toLowerCase();
    const name = text(record, "table_name").toLowerCase();
    const written = [catalog, text(record, "schema_name"), text(record, "table_name")]
      .filter((part) => part !== "")
      .join(".");
    if (catalog !== "") {
      this.issue(
        "invalid_reference",
        `\`${written}\` has three parts. Name relations as schema.name, for example silver.visits.`,
        record,
      );
    } else if (schema === "") {
      if (!ctes.has(name)) {
        this.issue(
          "invalid_reference",
          `\`${written}\` is not a CTE of this query. Name relations with their schema: ` +
            `bronze.${name}, silver.${name}, or gold.${name}.`,
          record,
        );
      }
    } else if (this.ignoredSchemas.has(schema)) {
      return;
    } else if (PIPELINE_SCHEMAS.has(schema)) {
      this.refs.push({ schema, name, at: this.at(record) });
    } else {
      this.issue(
        "invalid_reference",
        `\`${written}\` is outside the pipeline. Models read only bronze, silver, and gold.`,
        record,
      );
    }
  }

  private tableFunction(record: JsonObject): void {
    const fn = isRecord(record.function) ? text(record.function, "function_name") : "";
    this.issue(
      "table_function",
      `\`${fn}(...)\` is a table function. Models read only bronze, silver, and gold ` +
        `relations and their own CTEs.`,
      record,
    );
  }

  private function(record: JsonObject): void {
    const name = text(record, "function_name").toLowerCase();
    const schema = text(record, "schema").toLowerCase();
    if (CATALOG_SCHEMAS.has(schema)) {
      this.issue(
        "forbidden_function",
        `\`${schema}.${name}\` reads the database catalog, which is outside the pipeline.`,
        record,
      );
      return;
    }
    const reason = forbiddenReason(name);
    if (reason) {
      this.issue("forbidden_function", `\`${name}\` is not allowed in a model: ${reason}.`, record);
    }
  }

  private column(record: JsonObject): void {
    const names = record.column_names;
    if (!Array.isArray(names) || names.length !== 1) return;
    const name: unknown = names[0];
    if (typeof name === "string" && CLOCK_KEYWORDS.has(name.toLowerCase())) {
      this.issue(
        "forbidden_function",
        `\`${name.toLowerCase()}\` is not allowed in a model: its result changes from run to run.`,
        record,
      );
    }
  }
}

function parseFailure(sql: string, output: JsonObject): QueryIssue {
  const message = text(output, "error_message");
  if (message.startsWith("Only SELECT statements")) {
    return {
      code: "not_a_query",
      message:
        "A model must be a single query (SELECT, WITH, VALUES, or FROM). CREATE, INSERT, " +
        "and other statements are not allowed.",
      at: null,
    };
  }
  // Syntax error positions are counted in code points, unlike parse-tree locations.
  const position = Number.parseInt(text(output, "position"), 10);
  return {
    code: "syntax_error",
    message: message === "" ? "DuckDB could not parse this query." : message,
    at: Number.isNaN(position) ? null : indexOfCodePointOffset(sql, position),
  };
}

/**
 * Reads `json_serialize_sql` output for one model's rendered SQL (runtime contract 2.4, 2.5):
 * checks it is exactly one read-only query, collects every relation it reads in a pipeline
 * schema, and reports names that are neither those nor a CTE in scope, table functions, and
 * functions on the denylist. References in `ignoredSchemas` are template placeholders.
 */
export function analyzeQuery(
  sql: string,
  output: unknown,
  ignoredSchemas: ReadonlySet<string>,
): QueryAnalysis {
  if (!isRecord(output)) throw new Error("json_serialize_sql returned a non-object.");
  if (output.error === true) return { refs: [], issues: [parseFailure(sql, output)] };
  const statements = output.statements;
  if (!Array.isArray(statements)) throw new Error("json_serialize_sql returned no statements.");
  if (statements.length === 0) {
    return {
      refs: [],
      issues: [{ code: "no_query", message: "The model has no query.", at: null }],
    };
  }
  if (statements.length > 1) {
    return {
      refs: [],
      issues: [
        {
          code: "multiple_statements",
          message: `A model is one query, but this has ${String(statements.length)}.`,
          at: null,
        },
      ],
    };
  }
  const walker = new Walker(sql, ignoredSchemas);
  walker.walk(statements[0], new Set());
  return { refs: walker.refs, issues: walker.issues };
}
