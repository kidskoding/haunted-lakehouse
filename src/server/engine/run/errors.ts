import "server-only";

export type RunErrorCode =
  | "invalid-config"
  | "not-started"
  | "already-started"
  | "run-over"
  | "wrong-phase"
  | "wrong-slot"
  | "unknown-puzzle"
  | "puzzle-not-in-slot"
  | "prerequisite-not-played"
  | "pool-not-exhausted"
  | "curse-on-first-hour"
  | "boss-cannot-be-skipped"
  | "relic-not-held"
  | "relic-not-offered"
  | "relic-needs-skip"
  | "darkness"
  | "invalid-offer";

/** An event the run cannot accept in its current state. The state it was applied to is unchanged. */
export class RunEventError extends Error {
  readonly code: RunErrorCode;

  constructor(code: RunErrorCode, message: string) {
    super(message);
    this.name = "RunEventError";
    this.code = code;
  }
}
