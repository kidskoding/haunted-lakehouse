"use client";

import { useEffect, useState } from "react";
import type { EditorFile } from "@/components/editor";
import type { QueryResult } from "@/lib/engine/protocol";
import { compile, type CompiledPipeline, type CompileResult } from "@/lib/pipeline/compile";
import { jsonSerializeSqlParser } from "@/lib/pipeline/sql-parser";

export interface ProjectRules {
  readonly knownFeeds: readonly string[];
  readonly hourFeeds: readonly string[];
  readonly tableDisabled: boolean;
}

export type Compiled =
  | { readonly status: "pending" }
  | {
      readonly status: "done";
      /** The files this result is for; any other array is newer than it. */
      readonly files: readonly EditorFile[];
      readonly result: CompileResult;
      /** The last pipeline that compiled, which the DAG keeps showing mid-edit. */
      readonly lastGood: CompiledPipeline | null;
    }
  /** The engine itself failed while parsing, which no edit can fix. */
  | { readonly status: "failed"; readonly message: string };

// Long enough that typing doesn't parse every keystroke, short enough that the DAG keeps up.
const SETTLE_MS = 250;

/** Runs one query on the engine, in turn with everything else the page asks of it. */
export type EngineQuery = (sql: string) => Promise<QueryResult>;

/** Compiles the project with the engine's own parser, as Preview and Run the night need it. */
export function compileFiles(
  query: EngineQuery,
  files: readonly EditorFile[],
  rules: ProjectRules,
): Promise<CompileResult> {
  const parser = jsonSerializeSqlParser(async (sql) => {
    const { rows } = await query(sql);
    return String(rows[0]?.[0]);
  });
  return compile(
    files.map(({ path, source }) => ({ path, source })),
    { parser, ...rules },
  );
}

/**
 * The project compiled as the player types, for the DAG and the editor's marks. Stays pending
 * until the engine is `ready` to parse.
 */
export function useCompiled(
  query: EngineQuery,
  ready: boolean,
  files: readonly EditorFile[],
  rules: ProjectRules,
): Compiled {
  const [compiled, setCompiled] = useState<Compiled>({ status: "pending" });
  const { tableDisabled } = rules;
  const knownFeeds = rules.knownFeeds.join(",");
  const hourFeeds = rules.hourFeeds.join(",");

  useEffect(() => {
    if (!ready) return;
    let live = true;
    const timer = window.setTimeout(() => {
      compileFiles(query, files, {
        knownFeeds: knownFeeds.split(","),
        hourFeeds: hourFeeds.split(","),
        tableDisabled,
      }).then(
        (result) => {
          if (!live) return;
          setCompiled((previous) => ({
            status: "done",
            files,
            result,
            lastGood: result.ok
              ? result.pipeline
              : previous.status === "done"
                ? previous.lastGood
                : null,
          }));
        },
        (error: unknown) => {
          if (live) {
            setCompiled({
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );
    }, SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, ready, files, knownFeeds, hourFeeds, tableDisabled]);

  return compiled;
}
