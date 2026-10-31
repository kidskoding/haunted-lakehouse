import type { RuntimeErrorCode } from "./types";

interface Position {
  readonly line: number;
  readonly column: number;
}

/**
 * Why a model's step, or a read of gold, failed. The executor adds the batch, model, and
 * phase when it reports it.
 */
export class StepFailure extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
    readonly position?: Position,
  ) {
    super(message);
    this.name = "StepFailure";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// DuckDB ends a positioned error with the offending line and a caret under the spot:
// "\n\nLINE 3:   nope from t\n          ^". Long lines are cut down to "..." around the spot.
const LOCATION = /\n\nLINE (\d+): (.*)\n( *)\^\s*$/;
const ELLIPSIS = "...";

/**
 * Any failure as a `StepFailure`. A DuckDB error reaching here came from the executor's own
 * SQL, not the player's, so it becomes an `sql` failure with no position, and DuckDB's
 * location trailer, which would quote the executor's statement, is dropped.
 */
export function asStepFailure(error: unknown): StepFailure {
  return error instanceof StepFailure
    ? error
    : new StepFailure("sql", messageOf(error).replace(LOCATION, ""));
}

/**
 * A failure for a DuckDB error raised by a statement whose text is `prefixLines` lines of
 * executor SQL followed by `sql`, with the position mapped into `sql`. DuckDB's location
 * trailer is dropped from the message: its line number counts the executor's lines too.
 */
export function sqlFailure(error: unknown, sql: string, prefixLines: number): StepFailure {
  const message = messageOf(error);
  const match = LOCATION.exec(message);
  if (!match) return new StepFailure("sql", message);
  const [trailer, lineText = "", excerpt = "", caret = ""] = match;
  const stripped = message.slice(0, message.length - trailer.length);
  const line = Number(lineText) - prefixLines;
  const source = sql.split("\n")[line - 1];
  if (line < 1 || source === undefined) return new StepFailure("sql", stripped);
  const caretInExcerpt = caret.length - "LINE : ".length - lineText.length;
  const column = excerptColumn(source, excerpt, caretInExcerpt);
  return new StepFailure("sql", stripped, column === null ? undefined : { line, column });
}

function excerptColumn(source: string, excerpt: string, caretInExcerpt: number): number | null {
  if (!excerpt.startsWith(ELLIPSIS)) return caretInExcerpt + 1;
  const body = excerpt.slice(ELLIPSIS.length).replace(/\.\.\.$/, "");
  const start = source.indexOf(body);
  return start < 0 ? null : start + caretInExcerpt - ELLIPSIS.length + 1;
}
