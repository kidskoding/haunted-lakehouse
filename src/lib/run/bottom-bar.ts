/*
 * The run screen's bottom bar as plain data: what the server hands the client about the relics
 * in hand and the hour they would be used in, and the rules that decide whether each control
 * can act right now and why not. Nothing here imports server code, so client components can
 * use it; the server builds these views from the run state and the narrative flavor.
 */

/** Mirrors the engine's relic ids, which live in server-only code. */
export type RelicKind =
  "wrens-lantern" | "ravens-feather" | "hourglass" | "black-cat" | "spare-candle";

/** Mirrors the engine's run phases. Relics wake only `in-hour`. */
export type RunPhaseView = "opening" | "in-hour" | "offering" | "choosing" | "ended";

export interface RelicView {
  readonly kind: RelicKind;
  readonly name: string;
  /** The line in the town's voice. */
  readonly flavor: string;
  /** What it does, plainly. */
  readonly effect: string;
  /** Spent earlier this hour; it stays on the bar so the player sees where it went. */
  readonly used?: boolean;
}

export interface HiddenBatchView {
  readonly index: number;
  /** When it lands, as the town's clocks show it: `7:15pm`. */
  readonly arrivesAt: string;
}

/** What the open hour offers a relic to point at. */
export interface RelicBarHour {
  readonly phase: RunPhaseView;
  /** The hour opened under the Curse of Darkness. */
  readonly darkness: boolean;
  readonly boss: boolean;
  /** Bronze feeds, for Wren's Lantern. */
  readonly feeds: readonly string[];
  /** Batches the player can't query yet, for the Raven's Feather. */
  readonly hiddenBatches: readonly HiddenBatchView[];
  /** Gold tables, for the Hourglass. */
  readonly goldTables: readonly string[];
  /** The next checkpoint's time, which the Hourglass always looks at. */
  readonly nextCheckpoint: string;
}

/** What a targeted relic was pointed at; the shape maps one to one onto the server's request. */
export type RelicTarget =
  | { readonly kind: "feed"; readonly feed: string }
  | { readonly kind: "batch"; readonly batch: number }
  | { readonly kind: "table"; readonly table: string };

export interface TargetOption {
  /** Unique among the options, for the radio value. */
  readonly value: string;
  readonly label: string;
  readonly detail: string | null;
  readonly target: RelicTarget;
}

export interface TargetPicker {
  /** The picker's legend. */
  readonly legend: string;
  readonly options: readonly TargetOption[];
}

/**
 * What a relic asks before it is used: a target to pick, or `null` for the relics that only
 * need a yes (the Black Cat and the Spare Candle).
 */
export function targetPicker(kind: RelicKind, hour: RelicBarHour): TargetPicker | null {
  switch (kind) {
    case "wrens-lantern":
      return {
        legend: "Which feed?",
        options: hour.feeds.map((feed) => ({
          value: feed,
          label: feed,
          detail: null,
          target: { kind: "feed", feed },
        })),
      };
    case "ravens-feather":
      return {
        legend: "Which batch?",
        options: hour.hiddenBatches.map((batch) => ({
          value: String(batch.index),
          label: `Batch ${String(batch.index + 1)}`,
          detail: `lands at ${batch.arrivesAt}`,
          target: { kind: "batch", batch: batch.index },
        })),
      };
    case "hourglass":
      return {
        legend: `Which table, at ${hour.nextCheckpoint}?`,
        options: hour.goldTables.map((table) => ({
          value: table,
          label: table,
          detail: null,
          target: { kind: "table", table },
        })),
      };
    case "black-cat":
    case "spare-candle":
      return null;
  }
}

/**
 * The option a picker has selected, given the value the player last chose. The hour can change
 * while the picker is open, so a choice that is no longer offered falls back to the first option
 * still on offer; `undefined` means there is nothing left to point at.
 */
export function selectedOption(
  picker: TargetPicker,
  chosen: string | null,
): TargetOption | undefined {
  return picker.options.find((option) => option.value === chosen) ?? picker.options[0];
}

const NOTHING_TO_POINT_AT: Readonly<
  Record<"wrens-lantern" | "ravens-feather" | "hourglass", string>
> = {
  "wrens-lantern": "No feed has come in yet to hold the lantern up to.",
  "ravens-feather": "Every batch tonight has already landed.",
  hourglass: "Tonight has no gold table for the sand to count.",
};

/**
 * Why a relic can't be used right now, or `null` when it can. The checks run in the order a
 * player would want to hear them: a spent relic is spent whatever the hour.
 */
export function relicBlockedReason(relic: RelicView, hour: RelicBarHour): string | null {
  if (relic.used) return "Already used. Each relic is good for one use.";
  if (hour.phase !== "in-hour") return "Relics wake only while an hour is open.";
  if (hour.darkness) return "The Curse of Darkness is on this hour. Your charms won't light.";
  if (relic.kind === "black-cat" && hour.boss) return "The Black Cat won't cross a boss.";
  if (relic.kind === "black-cat" || relic.kind === "spare-candle") return null;
  const picker = targetPicker(relic.kind, hour);
  if (picker && picker.options.length === 0) return NOTHING_TO_POINT_AT[relic.kind];
  return null;
}

export type EngineStatus = "warming" | "ready" | "failed";

/** What is running in the browser right now. */
export type RunActivity = "idle" | "previewing" | "running";

export interface RunButtonsView {
  readonly engine: EngineStatus;
  readonly activity: RunActivity;
  /** The first model that doesn't compile, by name, or `null` when every model does. */
  readonly compileError: string | null;
  readonly boss: boolean;
  /** Candles still lit. */
  readonly candles: number;
}

function sharedBlock(view: RunButtonsView): string | null {
  if (view.engine === "warming") return "The engine is still warming up.";
  if (view.engine === "failed") return "The engine didn't start. Reload the page to try again.";
  if (view.compileError !== null) return `${view.compileError} has an error. Fix it first.`;
  return null;
}

/** Why Preview can't start, or `null`. A preview already in flight shows as busy instead. */
export function previewBlockedReason(view: RunButtonsView): string | null {
  if (view.activity === "running") return "The night is running.";
  if (view.activity === "previewing") return null;
  return sharedBlock(view);
}

/** Why Run the night can't start, or `null`. A run already in flight shows as busy instead. */
export function runBlockedReason(view: RunButtonsView): string | null {
  if (view.activity === "previewing") return "Wait for the preview to finish.";
  if (view.activity === "running") return null;
  return sharedBlock(view);
}

export interface NightStakes {
  /** Candles a break costs: 2 on a boss, else 1. */
  readonly cost: 1 | 2;
  /** A break would put out the last candle and end the run. */
  readonly last: boolean;
  /** One sentence for the confirm. */
  readonly summary: string;
}

/** What failing "Run the night" would cost, for the confirm that guards it. */
export function nightStakes(boss: boolean, candles: number): NightStakes {
  const cost = boss ? 2 : 1;
  const last = candles <= cost;
  const loses = cost === 2 ? "2 candles go out" : "1 candle goes out";
  const summary = boss
    ? `This is a boss hour. If any checkpoint breaks, ${loses}.`
    : `If any checkpoint breaks, ${loses}.`;
  return { cost, last, summary };
}
