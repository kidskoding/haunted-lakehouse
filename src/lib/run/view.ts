/*
 * The run screen's view of a run, as plain serializable data. The server builds it from the
 * run's state and the narrative engine; the client mounts the run screen on it. Nothing here
 * imports server code, and nothing in it carries generated data or expected answers.
 */

import type { HourClearedProps } from "@/components/run/hour-cleared";
import type { StoryAside } from "@/components/run/story";
import type { TopBarView } from "@/components/run/top-bar";
import type { NightCheckpoint } from "../executor/types";
import type { RenderedLine } from "../story/types";
import type { RelicBarHour, RelicView, RunPhaseView } from "./bottom-bar";
import type { NightSchedule } from "./night-timeline";
import type { TombstoneView } from "./tombstone";

/** Mirrors the engine's run statuses. */
export type RunStatusView = "playing" | "won-act" | "victory" | "dead" | "abandoned" | "stranded";

/** The candle the last failed night cost, and what the cast said about it. */
export interface RunLossView {
  /** Candles that break put out: two on a boss. */
  readonly cost: number;
  readonly reaction: readonly RenderedLine[];
}

/** The open hour: what the player reads, and everything the browser needs to run its night. */
export interface RunHourView {
  readonly slot: number;
  readonly puzzleId: string;
  readonly title: string;
  readonly boss: boolean;
  readonly story: {
    readonly lines: readonly RenderedLine[];
    readonly asides: readonly StoryAside[];
  };
  /** The hour's bronze feeds. */
  readonly feeds: readonly string[];
  /** How many batches bronze keeps this hour, after any curse. */
  readonly retention: number;
  /** The gold tables checkpoints read, as `schema.name`. */
  readonly goldTables: readonly string[];
  /** Checkpoints with their raw labels, as Run the night takes them. */
  readonly checkpoints: readonly NightCheckpoint[];
  readonly replayBatch: number | null;
  /** The batches the player may query now, the ones failed nights revealed included. */
  readonly visible: readonly number[];
  readonly schedule: NightSchedule;
  readonly relicHour: RelicBarHour;
  /** Set once a night in this hour has failed. */
  readonly lastLoss: RunLossView | null;
}

/** The hour just cleared, while the run waits between hours. */
export type RunClearedView = Omit<HourClearedProps, "onFinish">;

export interface RunDeathView {
  readonly stone: TombstoneView;
  readonly sharePath: string;
}

export interface RunView {
  readonly runId: string;
  readonly seed: string;
  readonly status: RunStatusView;
  readonly phase: RunPhaseView;
  /** False for the Purist, whose pipeline may only use `view` and `incremental` models. */
  readonly tableMaterialization: boolean;
  /** Every feed of the hours this run has played, which earlier models may still name. */
  readonly knownFeeds: readonly string[];
  readonly topBar: TopBarView;
  readonly relics: readonly RelicView[];
  readonly hour: RunHourView | null;
  readonly cleared: RunClearedView | null;
  readonly death: RunDeathView | null;
}
