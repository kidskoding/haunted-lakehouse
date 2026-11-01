import type { RenderedLine, RenderedPage } from "../story/types";

/** A page the player has found, with its text in full. */
export interface FoundLeaf {
  readonly kind: "found";
  readonly page: RenderedPage;
}

/** A page still missing. Only its numeral and year survive on the torn edge, never its text. */
export interface TornLeaf {
  readonly kind: "torn";
  readonly numeral: string;
  readonly year: number;
}

export type LedgerLeaf = FoundLeaf | TornLeaf;

/** The Ledger as a player sees it. */
export interface LedgerView {
  /** Every page, I to VII, in the order of the book. */
  readonly leaves: readonly LedgerLeaf[];
  /** Wren's word once every page is found, pointing to the night that keeps them. */
  readonly closing: RenderedLine | null;
}
