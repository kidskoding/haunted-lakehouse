import { TokenCursor, type TagToken } from "./tag-tokens";
import type { CompileErrorCode, Materialization } from "./types";

/** A model's configuration, from its `{{ config(...) }}` call or the defaults. */
export interface ModelConfig {
  readonly materialization: Materialization;
  /** Key columns as written, or null for an append-only or non-incremental model. */
  readonly uniqueKey: readonly string[] | null;
}

export const DEFAULT_CONFIG: ModelConfig = { materialization: "view", uniqueKey: null };

export interface ConfigError {
  readonly code: CompileErrorCode;
  readonly message: string;
  /** Index in the model file the error points at. */
  readonly at: number;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: ModelConfig }
  | { readonly ok: false; readonly error: ConfigError };

export interface ConfigRules {
  /** True when the run's character cannot use `table` (The Purist). */
  readonly tableDisabled: boolean;
}

const MATERIALIZATIONS: readonly string[] = ["view", "table", "incremental"];

function isMaterialization(value: string): value is Materialization {
  return MATERIALIZATIONS.includes(value);
}

function syntaxError(message: string, at: number): ConfigError {
  return { code: "config_syntax", message, at };
}

function readString(cursor: TokenCursor, what: string): TagToken | ConfigError {
  const token = cursor.peek();
  if (token?.kind !== "string") {
    return syntaxError(`Expected ${what} as a quoted string.`, cursor.position());
  }
  cursor.next();
  return token;
}

function isError(value: object): value is ConfigError {
  return "code" in value;
}

/** `string` or `[ string, ... ]` with an optional trailing comma. */
function readKeyList(cursor: TokenCursor): readonly TagToken[] | ConfigError {
  if (!cursor.accept("punct", "[")) {
    const single = readString(cursor, "a column name or a [list] of them");
    return isError(single) ? single : [single];
  }
  const keys: TagToken[] = [];
  do {
    if (keys.length > 0 && cursor.peek()?.value === "]") break;
    const key = readString(cursor, "a column name");
    if (isError(key)) return key;
    keys.push(key);
  } while (cursor.accept("punct", ","));
  if (!cursor.accept("punct", "]")) {
    return syntaxError("Expected `]` to close the list of key columns.", cursor.position());
  }
  return keys;
}

function checkKeys(keys: readonly TagToken[]): ConfigError | null {
  const seen = new Set<string>();
  for (const key of keys) {
    if (key.value.trim() === "") {
      return { code: "config_value", message: "A key column name cannot be empty.", at: key.start };
    }
    const folded = key.value.toLowerCase();
    if (seen.has(folded)) {
      return {
        code: "config_value",
        message: `Key column \`${key.value}\` is listed twice.`,
        at: key.start,
      };
    }
    seen.add(folded);
  }
  return null;
}

interface Arguments {
  materialized?: TagToken;
  uniqueKey?: readonly TagToken[];
  uniqueKeyAt?: number;
}

function readArguments(cursor: TokenCursor): Arguments | ConfigError {
  const args: Arguments = {};
  while (!cursor.accept("punct", ")")) {
    const name = cursor.next();
    if (name?.kind !== "ident") {
      return syntaxError("Expected an argument name or `)`.", name?.start ?? cursor.position());
    }
    if (name.value !== "materialized" && name.value !== "unique_key") {
      return {
        code: "config_argument",
        message: `Unknown config argument \`${name.value}\`. Use \`materialized\` or \`unique_key\`.`,
        at: name.start,
      };
    }
    const already = name.value === "materialized" ? args.materialized : args.uniqueKey;
    if (already) {
      return {
        code: "config_argument",
        message: `\`${name.value}\` is set twice.`,
        at: name.start,
      };
    }
    if (!cursor.accept("punct", "=")) {
      return syntaxError(`Expected \`=\` after \`${name.value}\`.`, cursor.position());
    }
    if (name.value === "materialized") {
      const value = readString(cursor, "the materialization");
      if (isError(value)) return value;
      args.materialized = value;
    } else {
      const keys = readKeyList(cursor);
      if (isError(keys)) return keys;
      args.uniqueKey = keys;
      args.uniqueKeyAt = name.start;
    }
    if (!cursor.accept("punct", ",") && cursor.peek()?.value !== ")") {
      return syntaxError("Expected `,` or `)`.", cursor.position());
    }
  }
  return args;
}

/**
 * Parses the tokens of a `{{ config(...) }}` tag, starting at `config` (runtime contract 2.2).
 * `end` is the index of the tag's closing delimiter, for errors at the end of the tag.
 */
export function parseConfig(
  tokens: readonly TagToken[],
  end: number,
  rules: ConfigRules,
): ConfigResult {
  const cursor = new TokenCursor(tokens, end);
  cursor.next();
  if (!cursor.accept("punct", "(")) {
    return { ok: false, error: syntaxError("Expected `(` after `config`.", cursor.position()) };
  }
  const args = readArguments(cursor);
  if (isError(args)) return { ok: false, error: args };
  if (!cursor.atEnd()) {
    return {
      ok: false,
      error: syntaxError("Unexpected text after `config(...)`.", cursor.position()),
    };
  }

  const materialization = args.materialized?.value ?? DEFAULT_CONFIG.materialization;
  if (!isMaterialization(materialization)) {
    return {
      ok: false,
      error: {
        code: "config_value",
        message: `Unknown materialization '${materialization}'. Use 'view', 'table', or 'incremental'.`,
        at: args.materialized?.start ?? end,
      },
    };
  }
  if (materialization === "table" && rules.tableDisabled) {
    return {
      ok: false,
      error: {
        code: "materialization_disabled",
        message: "The Purist cannot use `table`. Use 'view' or 'incremental'.",
        at: args.materialized?.start ?? end,
      },
    };
  }
  if (args.uniqueKey && materialization !== "incremental") {
    return {
      ok: false,
      error: {
        code: "config_value",
        message: "`unique_key` only applies to materialized='incremental'.",
        at: args.uniqueKeyAt ?? end,
      },
    };
  }
  const keyError = args.uniqueKey ? checkKeys(args.uniqueKey) : null;
  if (keyError) return { ok: false, error: keyError };
  return {
    ok: true,
    config: {
      materialization,
      uniqueKey: args.uniqueKey ? args.uniqueKey.map((key) => key.value) : null,
    },
  };
}
