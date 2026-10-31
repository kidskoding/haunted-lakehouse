import "server-only";
import { rngFor } from "../engine/random";
import type { CharacterId } from "../engine/run/types";
import type { Slot } from "../engine/slots";
import { marisol, mayor, narrator, thorne, wren } from "./lines";
import type { HourOwner, Line, Scene } from "./types";
import { hollowNamed, wrenLine, type WrenStage } from "./wren";

/** Stands in for the puzzle id in narrative stream keys, apart from every generator's. */
export const NARRATIVE_STREAM = "@narrative";

/** Bindings only lost-candle text uses, beyond the shared ones. */
export const LOST_CANDLE_BINDINGS = ["shown_value"] as const;

/** What the hour's owner says when "Run the night" breaks. Never a hint beyond the intro. */
export const OWNER_LOST_CANDLE: Readonly<Record<HourOwner, readonly Line[]>> = {
  mayor: [
    mayor(
      "At {failed_checkpoint} I said {*shown_value}. It was not the number. I could see it on their faces.",
      "At {failed_checkpoint} I said a number. It was not the number.",
    ),
    mayor("That's a candle. We have {candles|word} left. I'd like to keep one for the photograph."),
  ],
  marisol: [
    marisol(
      "It didn't balance at {failed_checkpoint}. I'm not saying it's your fault. I'm saying it didn't balance.",
    ),
  ],
  thorne: [
    thorne(
      "A child was told at {failed_checkpoint} that she was winning. She was not. Do you know what that does to a child?",
    ),
  ],
  wren: [
    wren("It held until {failed_checkpoint}. Look at what arrived just before it broke."),
    wren("Read the first thing they told you again. Slower."),
  ],
};

export const WREN_ONE_LEFT = wren("One left. I've worked with less. Not much less.");
export const WREN_BOSS_COST = wren("That one cost double. They always do.");

export interface LostCandle {
  readonly owner: HourOwner;
  readonly seed: string;
  readonly slot: Slot;
  /** Which failure this is in the hour, from 0, so a retry can draw a different line. */
  readonly attempt: number;
  readonly candlesLeft: number;
  /** Candles this failure cost: two on a boss. */
  readonly cost: number;
  readonly stage: WrenStage;
}

/**
 * One line from whoever owns the hour, then Wren: on the last candle, after a boss takes two,
 * or in her own stage's words. When the hour is hers, she speaks once.
 */
export function lostCandleScene(lost: LostCandle): Scene {
  const rng = rngFor([NARRATIVE_STREAM, lost.seed, lost.slot, "lost-candle", lost.attempt]);
  const special =
    lost.candlesLeft === 1 ? WREN_ONE_LEFT : lost.cost >= 2 ? WREN_BOSS_COST : undefined;
  if (lost.owner === "wren") return [special ?? rng.pick(OWNER_LOST_CANDLE.wren)];
  return [rng.pick(OWNER_LOST_CANDLE[lost.owner]), special ?? wrenLine(lost.stage, "candle-lost")];
}

/** How the story first notices who the player is, at the start of a run. */
export function characterRunStart(character: CharacterId, stage: WrenStage): Scene {
  switch (character) {
    case "intern":
      // The Intern starts with Wren's Lantern; she hands it over on the very first night.
      return stage === "W0"
        ? [
            wren(
              "Take this. You'll need to see where things came from, and nobody else will show you.",
            ),
          ]
        : [];
    case "night_clerk":
      return [wren("You know the stacks. Good.")];
    case "purist": {
      const arrival = narrator(
        "The Purist arrives at 5:58pm and asks where the incremental models are.",
      );
      return hollowNamed(stage)
        ? [arrival, wren("You don't throw things out. All right. You're not one of them.")]
        : [arrival];
    }
    case "old_wren":
      return [];
  }
}
