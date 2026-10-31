import "server-only";
import type { CharacterId, RelicId } from "./types";

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly candles: number;
  readonly startingRelics: readonly RelicId[];
  /** How many relics a cleared hour offers; zero means relics are never offered. */
  readonly offerSize: number;
  readonly tableMaterialization: boolean;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDefinition>> = {
  intern: {
    id: "intern",
    candles: 4,
    startingRelics: ["wrens-lantern"],
    offerSize: 2,
    tableMaterialization: true,
  },
  night_clerk: {
    id: "night_clerk",
    candles: 3,
    startingRelics: [],
    offerSize: 3,
    tableMaterialization: true,
  },
  purist: {
    id: "purist",
    candles: 3,
    startingRelics: [],
    offerSize: 2,
    tableMaterialization: false,
  },
  old_wren: {
    id: "old_wren",
    candles: 1,
    startingRelics: [],
    offerSize: 0,
    tableMaterialization: true,
  },
};

export function isCharacterId(value: string): value is CharacterId {
  return Object.hasOwn(CHARACTERS, value);
}
