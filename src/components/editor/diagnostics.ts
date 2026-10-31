import type { Diagnostic } from "@codemirror/lint";
import { indexOfLineColumn } from "@/lib/pipeline/position";
import type { EditorError } from "./types";

/**
 * Maps editor errors onto CodeMirror diagnostics. Errors without a place in the file become
 * a single mark at the start, so the gutter still shows that the file failed.
 */
export function errorsToDiagnostics(source: string, errors: readonly EditorError[]): Diagnostic[] {
  return errors.map((error) => {
    const place =
      error.line !== undefined && error.column !== undefined
        ? indexOfLineColumn(source, { line: error.line, column: error.column })
        : 0;
    const from = place ?? 0;
    const to = Math.min(from + 1, source.length);
    return {
      from,
      to: to === from ? from : to,
      severity: "error" as const,
      message: error.message,
    };
  });
}

/** Errors that belong to one model file, matched by path. */
export function errorsForPath(
  path: string,
  errors: readonly EditorError[],
): readonly EditorError[] {
  return errors.filter((error) => error.path === path);
}
