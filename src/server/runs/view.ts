import "server-only";
import type { TopBarSlot } from "@/components/run/top-bar";
import type { RelicId } from "../engine/run/types";
import type { RelicView } from "../../lib/run/bottom-bar";
import type { RunClearedView, RunDeathView, RunHourView, RunView } from "../../lib/run/view";
import { visibleIndices } from "../engine/batches/visibility";
import { generateHour } from "../engine/curses/apply";
import type { Checkpoint, Puzzle, PuzzleData } from "../engine/puzzle";
import { CHARACTERS } from "../engine/run/characters";
import type { CurseId, OpenHour, RunState } from "../engine/run/types";
import { SLOTS, slotDefinition } from "../engine/slots";
import { runBindings, type Voice } from "../narrative/bindings";
import { CURSE_FLAVOR, RELIC_FLAVOR } from "../narrative/flavor";
import { formatClock } from "../narrative/format";
import { clearedScene, introScene, renderAutopsy, renderCallouts } from "../narrative/hour";
import { narrativePack } from "../narrative/packs";
import { lostCandleScene, LOST_CANDLE_BINDINGS } from "../narrative/reactions";
import { renderScene, type RenderContext } from "../narrative/render";
import { tombstonePaths } from "../narrative/tombstone-link";
import { tombstone } from "../narrative/tombstones";
import { wrenStage } from "../narrative/wren";
import { storyProgressFrom, type PlayerUnlocks } from "../unlocks/progress";
import { puzzleRegistry, type OwnedRun } from "./load";

/** Who is looking at the run, beyond the run itself. */
export interface Viewer {
  /** The player's GitHub login, or null while they play anonymously. */
  readonly handle: string | null;
  readonly unlocks: PlayerUnlocks;
}

interface HourData {
  readonly puzzle: Puzzle;
  readonly data: PuzzleData;
  /** The story's numbers, with the Fog's symptoms already taken out. */
  readonly narrative: PuzzleData["narrative"];
  readonly withheld: readonly string[];
  readonly retention: number;
}

function hourData(puzzleId: string, seed: string, curse: CurseId | null): HourData {
  const puzzle = puzzleRegistry.get(puzzleId);
  if (!puzzle) throw new Error(`The run names unknown puzzle ${puzzleId}.`);
  // The same cursed night the batch routes serve, so feeds and retention match what loads.
  const { data, withheld, retention } = generateHour(puzzle, seed, curse);
  return { puzzle, data, narrative: data.narrative, withheld, retention };
}

function feedsOf(data: PuzzleData): string[] {
  return [...new Set(data.batches.flatMap((batch) => Object.keys(batch.feeds)))].sort();
}

function relicViews(relics: readonly RelicId[]): RelicView[] {
  return relics.map((kind) => ({ kind, ...RELIC_FLAVOR[kind] }));
}

function contextFor(
  state: RunState,
  hour: HourData,
  extra: { readonly failedCheckpoint?: Checkpoint; readonly withheld?: readonly string[] } = {},
): RenderContext {
  const run = runBindings({
    seed: state.seed,
    character: state.character,
    candles: state.candles,
    retention: hour.retention,
    checkpoints: hour.data.checkpoints,
    ...(extra.failedCheckpoint ? { failedCheckpoint: extra.failedCheckpoint } : {}),
  });
  return {
    bindings: { ...run, ...hour.narrative },
    withheld: [...hour.withheld, ...(extra.withheld ?? [])],
  };
}

const TOP_BAR_SLOTS: readonly TopBarSlot[] = SLOTS.map(({ slot, time, act, boss }) => ({
  slot,
  time,
  act,
  boss,
  // The clocks fall back at 2am daylight time, so the 1:00am hour opens on the second pass.
  repeat: time === "01:00",
}));

function openHourView(state: RunState, open: OpenHour, voice: Voice): RunHourView {
  const hour = hourData(open.puzzleId, state.seed, open.curse);
  const { puzzle, data } = hour;
  const pack = narrativePack(puzzle.id);
  const context = contextFor(state, hour);
  const visible = visibleIndices(data, puzzle.visibleBatchCount, open.revealed);
  const { boss } = slotDefinition(open.slot);
  const feeds = feedsOf(data);
  const goldTables = puzzle.goldTables;
  const firstCheckpoint = data.checkpoints[0];
  if (!firstCheckpoint) throw new Error(`${puzzle.id} has no checkpoints.`);

  const failedId = open.failures.at(-1);
  const failed = data.checkpoints.find((checkpoint) => checkpoint.id === failedId);
  const cost = boss ? 2 : 1;
  const lastLoss = failed
    ? {
        cost,
        reaction: renderScene(
          lostCandleScene({
            owner: pack.owner,
            seed: state.seed,
            slot: open.slot,
            attempt: open.failures.length - 1,
            candlesLeft: state.candles,
            cost,
            stage: voice.stage,
          }),
          // The server never sees the number the player's gold showed, so the Mayor can't quote it.
          contextFor(state, hour, { failedCheckpoint: failed, withheld: LOST_CANDLE_BINDINGS }),
          voice,
        ),
      }
    : null;

  return {
    slot: open.slot,
    puzzleId: puzzle.id,
    title: pack.title,
    boss,
    story: {
      lines: renderScene(introScene(pack, voice), context, voice),
      asides: renderCallouts(pack, context, "tour").map(({ id, segments }) => ({ id, segments })),
    },
    feeds,
    retention: hour.retention,
    goldTables,
    checkpoints: data.checkpoints.map(({ id, afterBatch, label }) => ({ id, afterBatch, label })),
    replayBatch: puzzle.replayBatch ?? null,
    visible,
    schedule: {
      batches: data.batches.map((batch) => ({
        index: batch.index,
        arrivesAt: formatClock(batch.arrivesAt),
        hidden: !visible.includes(batch.index),
      })),
      checkpoints: data.checkpoints.map(({ id, afterBatch, label }) => ({
        id,
        afterBatch,
        label: formatClock(label),
      })),
      replayBatch: puzzle.replayBatch ?? null,
    },
    relicHour: {
      phase: state.phase,
      darkness: open.curse === "darkness",
      boss,
      feeds,
      hiddenBatches: data.batches
        .filter((batch) => !visible.includes(batch.index))
        .map((batch) => ({ index: batch.index, arrivesAt: formatClock(batch.arrivesAt) })),
      goldTables,
      nextCheckpoint: formatClock(firstCheckpoint.label),
    },
    lastLoss,
  };
}

function clearedView(state: RunState, voice: Voice): RunClearedView | null {
  const last = state.history.at(-1);
  if (state.phase === "in-hour" || state.status === "dead" || last?.outcome !== "cleared") {
    return null;
  }
  const hour = hourData(last.puzzleId, state.seed, last.curse);
  const pack = narrativePack(last.puzzleId);
  const context = contextFor(state, hour);
  const offer = relicViews(state.offer ?? []);
  return {
    title: pack.title,
    beat: renderScene(clearedScene(pack, context.bindings, voice), context, voice),
    // shortcut: ledger pages aren't granted from run data yet; pass the found page here once they are.
    page: null,
    autopsy: renderAutopsy(pack, context),
    offer,
    bonusCurse:
      last.curse !== null && offer.length > CHARACTERS[state.character].offerSize
        ? CURSE_FLAVOR[last.curse].name
        : null,
  };
}

function deathView(state: RunState, viewer: Viewer): RunDeathView | null {
  const open = state.hour;
  if (state.status !== "dead" || !open) return null;
  const { data } = hourData(open.puzzleId, state.seed, open.curse);
  const failed = data.checkpoints.find((checkpoint) => checkpoint.id === open.failures.at(-1));
  if (!failed) throw new Error("A dead run's hour records the checkpoint that broke.");
  const death = {
    handle: viewer.handle,
    character: state.character,
    seed: state.seed,
    slot: open.slot,
    act: slotDefinition(open.slot).act,
    puzzleId: open.puzzleId,
    failedCheckpoint: { label: failed.label },
    // Daily Haunt runs aren't started from this route yet, so every run here is a normal one.
    daily: false,
    progress: storyProgressFrom(viewer.unlocks),
  };
  return { stone: tombstone(death), sharePath: tombstonePaths(death).share };
}

/**
 * Everything the run screen shows for a run, rendered on the server. Generated batches and
 * expected gold never leave here: the client gets the hour's shape and its story, and loads
 * batches through the batch routes, which enforce visibility.
 */
export function runView(run: OwnedRun, viewer: Viewer): RunView {
  const { state } = run;
  const voice: Voice = {
    character: state.character,
    stage: wrenStage(storyProgressFrom(viewer.unlocks), state.character),
  };
  const open = state.phase === "in-hour" || state.status === "dead" ? state.hour : null;
  const played = [...state.history, ...(state.hour ? [state.hour] : [])];
  const knownFeeds = new Set(
    played.flatMap((hour) => feedsOf(hourData(hour.puzzleId, state.seed, hour.curse).data)),
  );

  return {
    runId: run.id,
    seed: state.seed,
    status: state.status,
    phase: state.phase,
    tableMaterialization: state.tableMaterialization,
    knownFeeds: [...knownFeeds].sort(),
    topBar: {
      candles: {
        lit: state.candles,
        // Spare Candles can lift the count past the character's start.
        total: Math.max(CHARACTERS[state.character].candles, state.candles),
      },
      slot: state.slot,
      slots: TOP_BAR_SLOTS,
      seed: state.seed,
      curse: open?.curse ? CURSE_FLAVOR[open.curse].name : null,
    },
    relics: relicViews(state.relics),
    hour: open && state.status !== "dead" ? openHourView(state, open, voice) : null,
    cleared: clearedView(state, voice),
    death: deathView(state, viewer),
  };
}
