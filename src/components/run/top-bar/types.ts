/*
 * The top bar's view of a run. Client code can't reach the server-only engine, so these are
 * plain shapes a page fills from the run state and the slot table.
 */

export type ActNumber = 1 | 2 | 3;

export interface TopBarSlot {
  readonly slot: number;
  /** Local wall-clock time the hour opens, `HH:MM` on a 24-hour clock, as in the slot table. */
  readonly time: string;
  readonly act: ActNumber;
  readonly boss: boolean;
  /** The hour opens on the clock's second pass through this time, after the fall-back. */
  readonly repeat: boolean;
}

export interface TopBarView {
  readonly candles: { readonly lit: number; readonly total: number };
  /** The hour being played, or the next one to open. */
  readonly slot: number;
  /** Every hour of the night, in slot order. */
  readonly slots: readonly TopBarSlot[];
  readonly seed: string;
  /** The open hour's curse by name ("Curse of the Fog"), or null. */
  readonly curse: string | null;
}
