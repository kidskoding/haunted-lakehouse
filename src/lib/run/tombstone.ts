/*
 * The death moment as plain data: what the server engraves on a dead run's stone, and where
 * the stone's buttons lead. Nothing here imports server code, so client components can use it.
 */

/** A dead run's stone, engraved by the narrative engine (`tombstone()` on the server). */
export interface TombstoneView {
  /** The player's GitHub handle, or "A New Hire" for anonymous play. */
  readonly handle: string;
  readonly characterTitle: string;
  readonly epitaph: string;
  /** The hour the last candle went out in: "The Possessed Feed". */
  readonly hour: string;
  /** "went out at 7:15pm, Halloween 2026" */
  readonly wentOut: string;
  readonly seed: string;
  /** A faint green 1891 under the year, for Act III deaths once the Hollow has a name. */
  readonly hollowYear: boolean;
}

/** Where "Rise again" starts a fresh run. */
export const RISE_AGAIN_HREF = "/run/new";

/** A new run on the same seed: the same night, and the same stone if it ends the same way. */
export function replaySeedHref(seed: string): string {
  return `${RISE_AGAIN_HREF}?seed=${encodeURIComponent(seed)}`;
}
