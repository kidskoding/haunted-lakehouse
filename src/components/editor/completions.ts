import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { SQLNamespace } from "@codemirror/lang-sql";
import type { EditorRelation } from "./types";

/**
 * Builds the CodeMirror SQL schema tree from the relations the player can read. Tables are
 * registered both under their schema (`bronze.porch_events`) and at the top level so column
 * completion works after a bare table name as well as a qualified one.
 */
export function schemaFromRelations(relations: readonly EditorRelation[]): SQLNamespace {
  const root: Record<string, SQLNamespace> = {};
  for (const relation of relations) {
    const dot = relation.id.indexOf(".");
    if (dot <= 0 || dot === relation.id.length - 1) continue;
    const schema = relation.id.slice(0, dot);
    const table = relation.id.slice(dot + 1);
    const columns = [...relation.columns];
    const bucket = (root[schema] as Record<string, SQLNamespace> | undefined) ?? {};
    bucket[table] = columns;
    root[schema] = bucket;
    root[table] = columns;
  }
  return root;
}

function option(label: string, type: string, detail: string, apply?: string): Completion {
  return { label, type, detail, apply: apply ?? label, boost: 1 };
}

/** Template and helper snippets the pipeline grammar accepts inside a model file. */
export function templateOptions(relations: readonly EditorRelation[]): readonly Completion[] {
  const feeds = relations
    .filter((relation) => relation.id.startsWith("bronze."))
    .map((relation) => relation.id.slice("bronze.".length));

  const options: Completion[] = [
    option("{{ this }}", "keyword", "This model's current state"),
    option("is_incremental()", "function", "True after the model's first batch"),
    option(
      "{{ config(materialized='view') }}",
      "keyword",
      "Set materialization",
      "{{ config(materialized='view') }}",
    ),
    option(
      "{{ config(materialized='table') }}",
      "keyword",
      "Full-refresh table",
      "{{ config(materialized='table') }}",
    ),
    option(
      "{{ config(materialized='incremental', unique_key='id') }}",
      "keyword",
      "Incremental merge",
      "{{ config(materialized='incremental', unique_key='id') }}",
    ),
  ];

  if (feeds.length === 0) {
    options.push(
      option(
        "{{ new_batch('feed') }}",
        "keyword",
        "Rows that arrived in this batch",
        "{{ new_batch('feed') }}",
      ),
    );
  } else {
    for (const feed of feeds) {
      options.push(
        option(
          `{{ new_batch('${feed}') }}`,
          "keyword",
          `New rows for bronze.${feed}`,
          `{{ new_batch('${feed}') }}`,
        ),
      );
    }
  }
  return options;
}

/**
 * Completes pipeline tags and helpers when the player is typing a `{{ … }}` tag or the
 * `is_incremental` helper. Schema and keyword completion come from `@codemirror/lang-sql`.
 */
export function templateCompletionSource(
  relations: readonly EditorRelation[],
): (context: CompletionContext) => CompletionResult | null {
  const options = templateOptions(relations);
  return (context) => {
    const tag = context.matchBefore(/\{\{[^}]*/);
    if (tag) {
      return { from: tag.from, options: [...options], validFor: /^\{\{[^}]*$/ };
    }
    const helper = context.matchBefore(/\bis_incremental\(?/);
    if (helper) {
      return {
        from: helper.from,
        options: [option("is_incremental()", "function", "True after the model's first batch")],
        validFor: /^is_incremental\(?$/,
      };
    }
    return null;
  };
}
