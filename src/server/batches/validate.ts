import "server-only";
import type { ExpectedHashes, GoldHashes } from "../../lib/executor/types";
import type { Checkpoint } from "../engine/puzzle";

const HASH = /^[0-9a-f]{64}$/;

export type SubmittedHashes = Readonly<Record<string, GoldHashes>>;

export type ValidateNightResult =
  | { readonly survived: true }
  | {
      readonly survived: false;
      readonly checkpointId: string;
      readonly revealedBatch: number;
    };

/**
 * Walks checkpoints in order and returns the first whose submitted gold hashes disagree with
 * the expected ones. Missing or malformed hashes count as a miss — never as a pass.
 */
export function validateNight(
  checkpoints: readonly Checkpoint[],
  expected: ExpectedHashes,
  submitted: SubmittedHashes,
): ValidateNightResult {
  for (const checkpoint of checkpoints) {
    const wanted = expected[checkpoint.id] ?? {};
    const got = submitted[checkpoint.id];
    if (!got || mismatched(wanted, got)) {
      return {
        survived: false,
        checkpointId: checkpoint.id,
        revealedBatch: checkpoint.afterBatch,
      };
    }
  }
  return { survived: true };
}

function mismatched(wanted: GoldHashes, got: GoldHashes): boolean {
  const tables = Object.keys(wanted).sort();
  if (tables.length === 0) return true;
  for (const table of tables) {
    const hash = got[table];
    if (typeof hash !== "string" || !HASH.test(hash) || hash !== wanted[table]) return true;
  }
  return false;
}
