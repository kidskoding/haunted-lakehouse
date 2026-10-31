/*
 * The ending moment as plain data: what an ending opened for the player, and where Continue
 * leads. Nothing here imports server code, so client components can use it.
 */

/** A character an ending unlocked, described the way the character select describes them. */
export interface RevealedCharacter {
  readonly name: string;
  readonly candles: number;
  readonly rules: readonly string[];
}

/** What an ending unlocked for the first time. Built on the server from the granted awards. */
export interface EndingRevealView {
  /** The act this ending opened, or null when it opened none (the Séance has no act after it). */
  readonly act: 2 | 3 | null;
  readonly characters: readonly RevealedCharacter[];
}

/** Where an ending's Continue goes: the hub between runs. */
export const CRYPT_HREF = "/crypt";
