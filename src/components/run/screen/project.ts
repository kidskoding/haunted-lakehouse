import type { EditorError, EditorFile } from "@/components/editor";
import type { CompileError } from "@/lib/pipeline/types";

/** `gold.welcoming_houses` lives at `gold/welcoming_houses.sql`. */
export function pathOfModel(id: string): string {
  return `${id.replace(".", "/")}.sql`;
}

/** The model a file defines: `silver/porch_state.sql` is `silver.porch_state`. */
export function modelOfPath(path: string): string {
  return path.replace(/\.sql$/, "").replace("/", ".");
}

/** A model path the compiler accepts, without its `.sql`: `silver/porch_state`. */
export const MODEL_NAME = /^(silver|gold)\/[a-z][a-z0-9_]{0,62}$/;

/**
 * The project with a starting file for every gold table the hour reads that has none yet: a
 * view straight over the hour's first feed, so Preview has something to run from the start.
 */
export function withGoldStarters(
  files: readonly EditorFile[],
  goldTables: readonly string[],
  feed: string | undefined,
): readonly EditorFile[] {
  const missing = goldTables
    .map(pathOfModel)
    .filter((path) => !files.some((file) => file.path === path));
  if (missing.length === 0) return files;
  const source = `{{ config(materialized='view') }}\nselect *\nfrom bronze.${feed ?? "feed"}\n`;
  return [...files, ...missing.map((path) => ({ path, source }))];
}

/** Compile errors as the editor marks them: on the file of the model they name. */
export function editorErrors(errors: readonly CompileError[]): EditorError[] {
  return errors.flatMap((error) =>
    error.model === null
      ? []
      : [
          {
            path: pathOfModel(error.model),
            message: error.message,
            ...(error.line === undefined ? {} : { line: error.line }),
            ...(error.column === undefined ? {} : { column: error.column }),
          },
        ],
  );
}
