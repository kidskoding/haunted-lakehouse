import "server-only";
import type { Row } from "../puzzle";

/** One kind of candy the Co-op sells to households for the night. */
export interface Candy {
  readonly candyType: string;
  readonly name: string;
  /** Weight of one wrapped piece, in whole grams. */
  readonly gramsPerPiece: number;
  /** Every household buys the Co-op's standard bag (or box), so it always holds this many pieces. */
  readonly piecesPerBag: number;
  /** How often households pick it: the cheap fun-size bars sell best. */
  readonly popularity: number;
}

/*
 * Wrapped fun-size weights, rounded to the gram. The lightest is 12 g so that a bowl scale's
 * ±2 g noise, at most 4 g across two readings, stays under half a piece: a careful reader can
 * always turn a weight change back into whole pieces, a careless one can't.
 */
export const CANDY_CATALOG: readonly Candy[] = [
  {
    candyType: "fun-size-bar",
    name: "Fun-size chocolate bar",
    gramsPerPiece: 15,
    piecesPerBag: 40,
    popularity: 8,
  },
  {
    candyType: "peanut-butter-cup",
    name: "Peanut butter cup",
    gramsPerPiece: 21,
    piecesPerBag: 30,
    popularity: 5,
  },
  {
    candyType: "lollipop",
    name: "Tootsie-style pop",
    gramsPerPiece: 17,
    piecesPerBag: 50,
    popularity: 4,
  },
  {
    candyType: "gummy-pack",
    name: "Gummy pouch",
    gramsPerPiece: 23,
    piecesPerBag: 25,
    popularity: 4,
  },
  {
    candyType: "sour-chews",
    name: "Sour chews",
    gramsPerPiece: 12,
    piecesPerBag: 60,
    popularity: 3,
  },
  {
    candyType: "candy-corn",
    name: "Candy corn snack pack",
    gramsPerPiece: 28,
    piecesPerBag: 20,
    popularity: 2,
  },
  {
    candyType: "popcorn-ball",
    name: "Popcorn ball",
    gramsPerPiece: 35,
    piecesPerBag: 20,
    popularity: 1,
  },
  {
    candyType: "full-size-bar",
    name: "Full-size chocolate bar",
    gramsPerPiece: 45,
    piecesPerBag: 24,
    popularity: 1,
  },
];

/** The catalog as a reference feed: what each candy weighs and how many come in a bag. */
export function candyCatalogRows(): Row[] {
  return CANDY_CATALOG.map((candy) => ({
    candy_type: candy.candyType,
    name: candy.name,
    grams_per_piece: candy.gramsPerPiece,
    pieces_per_bag: candy.piecesPerBag,
  }));
}
