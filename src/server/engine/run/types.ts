import "server-only";
import type { Act, Slot } from "../slots";

export type CharacterId = "intern" | "night_clerk" | "purist" | "old_wren";

export type RelicId =
  "wrens-lantern" | "ravens-feather" | "hourglass" | "black-cat" | "spare-candle";

/**
 * One relic use and what it was pointed at. The target is fixed at the moment of use, so the
 * reveal can be rebuilt from the event alone however far the hour has moved on since.
 */
export type RelicUse =
  | { readonly relic: "wrens-lantern"; readonly feed: string }
  | { readonly relic: "ravens-feather"; readonly batch: number }
  | { readonly relic: "hourglass"; readonly table: string; readonly checkpointId: string };

export type CurseId = "possession" | "fog" | "short-memory" | "darkness";

/** The ending a boss clear reveals, one per act. */
export type EndingId = `act-${Act}`;

/**
 * `won-act` ends a run at the last boss the player has unlocked; `victory` clears the final
 * hour; `stranded` means the next hour's pool had no puzzle this run could play.
 */
export type RunStatus = "playing" | "won-act" | "victory" | "dead" | "abandoned" | "stranded";

/**
 * What a playing run waits for: the next hour to open, the player to work the open hour, a
 * relic offer to be drawn, or the player to answer that offer. A finished run is `ended`.
 */
export type RunPhase = "opening" | "in-hour" | "offering" | "choosing" | "ended";

export interface RunConfig {
  readonly seed: string;
  readonly character: CharacterId;
  /** The highest act this player has unlocked; the run ends after that act's boss. */
  readonly unlockedActs: Act;
}

export interface OpenHour {
  readonly slot: Slot;
  readonly puzzleId: string;
  readonly curse: CurseId | null;
  /** The checkpoint that broke on each failed "Run the night", in order. */
  readonly failures: readonly string[];
  /** The batch each failed "Run the night" revealed to the player, in order. */
  readonly revealed: readonly number[];
}

export interface HourRecord extends OpenHour {
  readonly outcome: "cleared" | "skipped";
}

export interface RunState {
  readonly seed: string;
  readonly character: CharacterId;
  readonly unlockedActs: Act;
  readonly status: RunStatus;
  readonly phase: RunPhase;
  readonly candles: number;
  /** False for the Purist, whose pipeline may only use `view` and `incremental` models. */
  readonly tableMaterialization: boolean;
  /** The hour being played, or the next one to open. */
  readonly slot: Slot;
  readonly hour: OpenHour | null;
  /** Every hour that has closed, in slot order. */
  readonly history: readonly HourRecord[];
  /** Relics in hand, each good for one use. Spare Candle is spent the moment it's chosen. */
  readonly relics: readonly RelicId[];
  readonly offer: readonly RelicId[] | null;
  readonly actReached: Act;
  readonly lastEnding: EndingId | null;
}

/**
 * Everything that can happen to a run. Each event is a flat, JSON-serializable object whose
 * `kind` goes in `run_events.kind` and whose other fields form its payload.
 */
export type RunEvent =
  | ({ readonly kind: "run_started" } & RunConfig)
  | {
      readonly kind: "hour_opened";
      readonly slot: Slot;
      readonly puzzleId: string;
      readonly curse: CurseId | null;
    }
  /** The next hour's pool had nothing this run could play, so the night can't go on. */
  | { readonly kind: "pool_exhausted"; readonly slot: Slot }
  /** `checkpointId` is the first checkpoint not passed; `revealedBatch` is where it broke. */
  | {
      readonly kind: "attempt_failed";
      readonly slot: Slot;
      readonly checkpointId: string;
      readonly revealedBatch: number;
    }
  | { readonly kind: "hour_cleared"; readonly slot: Slot }
  | { readonly kind: "hour_skipped"; readonly slot: Slot }
  | { readonly kind: "relic_offered"; readonly relics: readonly RelicId[] }
  | { readonly kind: "relic_chosen"; readonly relic: RelicId }
  | { readonly kind: "relic_declined" }
  | ({ readonly kind: "relic_used" } & RelicUse)
  | { readonly kind: "run_abandoned" };

export type RunEventKind = RunEvent["kind"];
