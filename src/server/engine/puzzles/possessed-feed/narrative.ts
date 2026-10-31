import "server-only";
import type { Drop } from "./drops";
import { isCountable, type Spelling, type SpellingKind } from "./spellings";

export interface NarrativeInputs {
  /** Every drop of the evening, with the batch it lands in. */
  readonly placed: readonly { readonly drop: Drop; readonly batch: number }[];
  readonly spellings: ReadonlyMap<string, Spelling>;
  /** The batch the item and quantity start trading places. */
  readonly reorderFrom: number;
  /** The first batch the player never sees before running the night. */
  readonly hiddenFrom: number;
}

/** The first visible spelling of a kind, for Hobb's note to quote back at the player. */
function example(inputs: NarrativeInputs, kind: SpellingKind, fallback: string): string {
  for (const { drop, batch } of inputs.placed) {
    if (batch >= inputs.hiddenFrom) break;
    const spelling = inputs.spellings.get(drop.dropId);
    if (spelling?.kind === kind && spelling.text !== "") return spelling.text;
  }
  return fallback;
}

/**
 * Whether a strict integer cast of the delivered quantity fails: the quantity is spelled out,
 * or the row's item and quantity traded places so the quantity column holds an item name.
 */
function failsStrictCast(inputs: NarrativeInputs, drop: Drop, batch: number): boolean {
  if (batch >= inputs.reorderFrom) return true;
  const kind = inputs.spellings.get(drop.dropId)?.kind;
  return kind !== undefined && kind !== "digits";
}

/**
 * The numbers and spellings the hour's story and autopsy quote, all from this run's evening,
 * keyed by the story's placeholder names.
 */
export function narrativeBindings(inputs: NarrativeInputs): Record<string, number | string> {
  const { placed, spellings } = inputs;
  const countable = placed.filter(({ drop }) => isCountable(spellings.get(drop.dropId)));
  const sum = (drops: readonly { drop: Drop }[]) =>
    drops.reduce((total, { drop }) => total + drop.quantity, 0);

  return {
    drop_count: placed.length,
    // Hobb bills what every drop really held, the uncounted ones included.
    invoiced_pieces: sum(placed),
    paid_pieces: sum(countable),
    recovered_rows: countable.filter(({ drop, batch }) => failsStrictCast(inputs, drop, batch))
      .length,
    unknown_rows: placed.length - countable.length,
    swapped_rows: placed.filter(({ batch }) => batch >= inputs.reorderFrom).length,
    example_unit: example(inputs, "unit", "6 pcs"),
    example_word: example(inputs, "word", "seven"),
    example_dozen: example(inputs, "dozen", "a dozen"),
    example_vague: example(inputs, "vague", "lots"),
  };
}
