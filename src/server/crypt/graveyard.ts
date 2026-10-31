import "server-only";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  EVERY_STONE,
  type GraveStone,
  type GraveyardFilter,
  type GraveyardOption,
  type GraveyardPage,
  LAST_PAGE,
  STONES_PER_PAGE,
} from "@/lib/crypt/graveyard";
import { replaySeedHref } from "@/lib/run/tombstone";
import { db } from "../db/client";
import { players, runEvents, runs, unlocks } from "../db/schema";
import type { Checkpoint } from "../engine/puzzle";
import { ALL_PUZZLES } from "../engine/puzzles";
import { generatePuzzle } from "../engine/registry";
import type { CharacterId } from "../engine/run/types";
import { slotDefinition } from "../engine/slots";
import { PERSONAS } from "../narrative/bindings";
import { narrativePack } from "../narrative/packs";
import { tombstonePaths } from "../narrative/tombstone-link";
import { tombstone, type Death } from "../narrative/tombstones";
import type { RunDatabase } from "../runs/load";
import { ALL_CHARACTERS } from "../unlocks/catalog";

export const GRAVEYARD_CHARACTERS: readonly GraveyardOption[] = ALL_CHARACTERS.map((id) => ({
  value: id,
  label: PERSONAS[id].title,
}));

/** Every hour a run can die in, in the order the night reaches them. */
export const GRAVEYARD_HOURS: readonly GraveyardOption[] = [...ALL_PUZZLES]
  .sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id))
  .map(({ id }) => ({ value: id, label: narrativePack(id).title }));

const PAGE_NUMBER = /^[1-9][0-9]*$/;

function single(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

function among(options: readonly GraveyardOption[], value: string | null): string | null {
  return options.some((option) => option.value === value) ? value : null;
}

/**
 * The filter a Graveyard URL asks for. Anything a link of ours wouldn't carry (an unknown
 * character or hour, a repeated key, a page past the last) falls back to its default, so an
 * edited link still shows a hill, never an error.
 */
export function graveyardFilterFrom(params: URLSearchParams): GraveyardFilter {
  const page = single(params, "page");
  const pageNumber = page !== null && PAGE_NUMBER.test(page) ? Number(page) : EVERY_STONE.page;
  return {
    character: among(GRAVEYARD_CHARACTERS, single(params, "character")),
    hour: among(GRAVEYARD_HOURS, single(params, "hour")),
    daily: single(params, "daily") === "1",
    page: pageNumber <= LAST_PAGE ? pageNumber : EVERY_STONE.page,
  };
}

interface DeadRunRow {
  readonly seed: string;
  readonly character: CharacterId;
  readonly daily: boolean;
  readonly githubId: number | null;
  readonly githubLogin: string | null;
  readonly slot: string;
  readonly checkpointId: string;
  readonly puzzleId: string;
  readonly hollowNamed: boolean;
}

/**
 * The dead runs a filter matches, newest first, one more than a page so the caller knows
 * whether an older page exists. A dead run's last `attempt_failed` is the one that put the
 * last candle out, and the `hour_opened` for its slot names the puzzle it broke on.
 */
async function deadRuns(database: RunDatabase, filter: GraveyardFilter): Promise<DeadRunRow[]> {
  const failure = database
    .select({
      slot: sql<string>`${runEvents.payload}->>'slot'`.as("slot"),
      checkpointId: sql<string>`${runEvents.payload}->>'checkpointId'`.as("checkpoint_id"),
    })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runs.id), eq(runEvents.kind, "attempt_failed")))
    .orderBy(desc(runEvents.seq))
    .limit(1)
    .as("failure");
  const opened = database
    .select({ puzzleId: sql<string>`${runEvents.payload}->>'puzzleId'`.as("puzzle_id") })
    .from(runEvents)
    .where(
      and(
        eq(runEvents.runId, runs.id),
        eq(runEvents.kind, "hour_opened"),
        sql`${runEvents.payload}->>'slot' = ${failure.slot}`,
      ),
    )
    .orderBy(desc(runEvents.seq))
    .limit(1)
    .as("opened");

  const conditions: SQL[] = [eq(runs.status, "dead")];
  if (filter.character !== null) {
    conditions.push(eq(runs.character, filter.character as CharacterId));
  }
  if (filter.daily) conditions.push(isNotNull(runs.dailyDate));
  if (filter.hour !== null) conditions.push(eq(opened.puzzleId, filter.hour));

  return database
    .select({
      seed: runs.seed,
      character: runs.character,
      daily: sql<boolean>`${runs.dailyDate} is not null`,
      githubId: players.githubId,
      githubLogin: players.githubLogin,
      slot: failure.slot,
      checkpointId: failure.checkpointId,
      puzzleId: opened.puzzleId,
      // The stone shows the Hollow's year once its player had seen the Act II ending, as the
      // death moment did; an ending seen after this death must not rewrite its stone.
      hollowNamed: sql<boolean>`exists (
        select 1 from ${unlocks}
        where ${unlocks.playerId} = ${runs.playerId}
          and ${unlocks.kind} = 'ending'
          and ${unlocks.key} = 'act-2'
          and ${unlocks.createdAt} <= ${runs.endedAt}
      )`,
    })
    .from(runs)
    .innerJoin(players, eq(players.id, runs.playerId))
    .innerJoinLateral(failure, sql`true`)
    .innerJoinLateral(opened, sql`true`)
    .where(and(...conditions))
    .orderBy(desc(runs.endedAt), desc(runs.id))
    .limit(STONES_PER_PAGE + 1)
    .offset((filter.page - 1) * STONES_PER_PAGE);
}

/**
 * The run's own night decides its checkpoint clocks, so the label comes from regenerating
 * that puzzle for the run's seed. Stones that share a night share one generation.
 */
function checkpointLabels() {
  const nights = new Map<string, readonly Checkpoint[]>();
  return (puzzleId: string, seed: string, checkpointId: string): string | null => {
    const puzzle = ALL_PUZZLES.find(({ id }) => id === puzzleId);
    if (!puzzle) return null;
    const key = `${puzzleId}\u0000${seed}`;
    let checkpoints = nights.get(key);
    if (!checkpoints) {
      checkpoints = generatePuzzle(puzzle, seed).checkpoints;
      nights.set(key, checkpoints);
    }
    return checkpoints.find(({ id }) => id === checkpointId)?.label ?? null;
  };
}

/**
 * One page of the Graveyard: recent dead runs across every player, engraved the way their
 * death moment engraved them. Only a GitHub login is shown; anonymous players stay "A New Hire",
 * and no run or player id leaves the server.
 */
export async function loadGraveyardWith(
  database: RunDatabase,
  filter: GraveyardFilter,
): Promise<GraveyardPage> {
  const rows = await deadRuns(database, filter);
  const labelFor = checkpointLabels();
  const stones: GraveStone[] = [];

  for (const row of rows.slice(0, STONES_PER_PAGE)) {
    const puzzle = ALL_PUZZLES.find(({ id }) => id === row.puzzleId);
    const label = labelFor(row.puzzleId, row.seed, row.checkpointId);
    // A run recorded against a puzzle or checkpoint the game no longer has can't be engraved.
    if (!puzzle || String(puzzle.slot) !== row.slot || label === null) continue;
    const death: Death = {
      handle: row.githubId !== null ? row.githubLogin : null,
      character: row.character,
      seed: row.seed,
      slot: puzzle.slot,
      act: slotDefinition(puzzle.slot).act,
      puzzleId: puzzle.id,
      failedCheckpoint: { label },
      daily: row.daily,
      progress: { runsFinished: 0, endingsSeen: row.hollowNamed ? ["act-2"] : [], pagesHeld: [] },
    };
    stones.push({
      stone: tombstone(death),
      sharePath: tombstonePaths(death).share,
      replayPath: replaySeedHref(death.seed),
    });
  }

  return { stones, hasMore: rows.length > STONES_PER_PAGE && filter.page < LAST_PAGE };
}

/**
 * {@link loadGraveyardWith} against the shared pool. Null when the database can't be read, so
 * the Graveyard says so instead of showing an empty hill.
 */
export async function loadGraveyard(filter: GraveyardFilter): Promise<GraveyardPage | null> {
  try {
    return await loadGraveyardWith(db(), filter);
  } catch (error) {
    console.error("The Graveyard couldn't read the dead runs", error);
    return null;
  }
}
