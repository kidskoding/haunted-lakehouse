import "server-only";

export type RelicErrorCode =
  | "not-targeted"
  | "wrong-puzzle"
  | "unknown-feed"
  | "unknown-batch"
  | "batch-not-hidden"
  | "unknown-table"
  | "unknown-checkpoint";

/**
 * A relic pointed at something it can't reveal. Rules about the run itself, such as holding
 * the relic or the Darkness curse, are the reducer's and surface as a `RunEventError`.
 */
export class RelicError extends Error {
  readonly code: RelicErrorCode;

  constructor(code: RelicErrorCode, message: string) {
    super(message);
    this.name = "RelicError";
    this.code = code;
  }
}
