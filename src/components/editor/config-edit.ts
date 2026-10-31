import { parseConfig, type ModelConfig } from "@/lib/pipeline/parse-config";
import { tokenizeTag } from "@/lib/pipeline/tag-tokens";

/** What a model file says about its configuration, as the materialization picker reads it. */
export type ConfigState =
  /** No config call: the model is a view. */
  | { readonly kind: "default" }
  | {
      readonly kind: "set";
      readonly config: ModelConfig;
      readonly from: number;
      readonly to: number;
    }
  /** A config call the compiler would reject; the picker can still replace it. */
  | { readonly kind: "invalid"; readonly from: number; readonly to: number }
  /** A config call with no closing `}}`; replacing it would swallow the rest of the file. */
  | { readonly kind: "unclosed" };

/** Finds the model's `{{ config(...) }}` call and reads it with the compiler's own parser. */
export function readConfig(source: string): ConfigState {
  for (let open = source.indexOf("{{"); open !== -1; open = source.indexOf("{{", open + 2)) {
    const close = source.indexOf("}}", open + 2);
    const content = source.slice(open + 2, close === -1 ? source.length : close);
    const tokenized = tokenizeTag(content, open + 2);
    const [first] = tokenized.ok ? tokenized.tokens : [];
    const isConfig = tokenized.ok
      ? first?.kind === "ident" && first.value === "config"
      : /^\s*config\b/.test(content);
    if (!isConfig) continue;
    if (close === -1) return { kind: "unclosed" };
    const to = close + 2;
    if (!tokenized.ok) return { kind: "invalid", from: open, to };
    // The picker shows what the file says; the compiler reports `table` for The Purist.
    const parsed = parseConfig(tokenized.tokens, close, { tableDisabled: false });
    return parsed.ok
      ? { kind: "set", config: parsed.config, from: open, to }
      : { kind: "invalid", from: open, to };
  }
  return { kind: "default" };
}

function quote(value: string): string {
  return `'${value}'`;
}

/** The config call for a configuration, in the form the runtime contract documents. */
export function configCall(config: ModelConfig): string {
  const args = [`materialized=${quote(config.materialization)}`];
  const keys = config.materialization === "incremental" ? (config.uniqueKey ?? []) : [];
  if (keys.length === 1 && keys[0] !== undefined) args.push(`unique_key=${quote(keys[0])}`);
  if (keys.length > 1) args.push(`unique_key=[${keys.map(quote).join(", ")}]`);
  return `{{ config(${args.join(", ")}) }}`;
}

/**
 * Rewrites the model's config call, or adds one at the top. Returns null when the file's config
 * call is unclosed. `unique_key` only survives on an incremental model.
 */
export function writeConfig(source: string, config: ModelConfig): string | null {
  const state = readConfig(source);
  const call = configCall(config);
  switch (state.kind) {
    case "unclosed":
      return null;
    case "default":
      return `${call}\n${source}`;
    case "set":
    case "invalid":
      return source.slice(0, state.from) + call + source.slice(state.to);
  }
}

/** Splits a typed `unique_key` list such as `house_id, ts` into column names. */
export function parseKeyList(text: string): readonly string[] | null {
  const keys = text
    .split(",")
    .map((key) => key.trim().replace(/^(['"])(.*)\1$/, "$2"))
    .filter((key) => key !== "");
  return keys.length === 0 ? null : keys;
}
