import type { TombstoneView } from "../run/tombstone";

/*
 * The Graveyard as plain data: which stones a visitor asked for, and the links that ask for
 * others. The server validates every value before it lands in a filter; nothing here imports
 * server code, so components can build links from it.
 */

export const GRAVEYARD_PATH = "/crypt/graveyard";

export const STONES_PER_PAGE = 12;

/** The deepest page the hill goes back, so no request reads further into the past than this. */
export const LAST_PAGE = 20;

export interface GraveyardFilter {
  /** A character id, or null for anyone. */
  readonly character: string | null;
  /** The puzzle id of the hour the last candle went out in, or null for any hour. */
  readonly hour: string | null;
  /** Only Daily Haunt runs. */
  readonly daily: boolean;
  /** 1-based, at most {@link LAST_PAGE}. */
  readonly page: number;
}

export const EVERY_STONE: GraveyardFilter = { character: null, hour: null, daily: false, page: 1 };

export interface GraveyardOption {
  readonly value: string;
  readonly label: string;
}

/** A stone on the hill and where it leads: its own share page, and the same night again. */
export interface GraveStone {
  readonly stone: TombstoneView;
  readonly sharePath: string;
  readonly replayPath: string;
}

export interface GraveyardPage {
  /** Newest first. */
  readonly stones: readonly GraveStone[];
  /** Whether an older page holds more stones. */
  readonly hasMore: boolean;
}

/** The Graveyard's URL for a filter; the default values stay out of it. */
export function graveyardHref(filter: GraveyardFilter): string {
  const params = new URLSearchParams();
  if (filter.character !== null) params.set("character", filter.character);
  if (filter.hour !== null) params.set("hour", filter.hour);
  if (filter.daily) params.set("daily", "1");
  if (filter.page > 1) params.set("page", String(filter.page));
  const query = params.toString();
  return query ? `${GRAVEYARD_PATH}?${query}` : GRAVEYARD_PATH;
}

/** Whether a filter narrows the hill at all, page aside. */
export function isFiltered(filter: GraveyardFilter): boolean {
  return filter.character !== null || filter.hour !== null || filter.daily;
}
