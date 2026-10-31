import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import type { DoorScan } from "./door-scans";
import { clockAt, type UtcOffset } from "./night-clock";
import { townRng } from "./town";
import type { TrickOrTreater } from "./trick-or-treaters";

/**
 * One submission of a costume-contest ballot, as it truly happened. A voter's first vote is
 * revision 1; every edit is a new row with the same ballot and the next revision, so only
 * the highest revision of each ballot is that voter's current vote.
 */
export interface CostumeVote {
  readonly ballotId: string;
  readonly revision: number;
  readonly voterKidId: string;
  /** The kid being voted for. Several kids can wear the same costume; a ballot names one. */
  readonly entrantKidId: string;
  /** True time, in seconds since 18:00 CDT. Never shipped: it is what the clock face encodes. */
  readonly nightSecond: number;
  readonly castAtLocal: string;
  readonly utcOffset: UtcOffset;
}

/** One entrant's tally of current votes. */
export interface Standing {
  readonly entrantKidId: string;
  readonly votes: number;
}

// Voting closes at 22:00 CDT, when the judges announce the winner.
const VOTING_CLOSES = 4 * 3600;
// A kid needs a little time out on the streets to have seen anyone's costume.
const MIN_LOOK_AROUND = 60;
const MAX_LOOK_AROUND = 75 * 60;
// The share of kids out in time to vote who do vote; kids who arrive after the close can't.
const VOTER_SHARE_MIN = 0.6;
const VOTER_SHARE_MAX = 0.85;
// Friends vote for friends: a groupmate's costume is the one a kid saw all night.
const GROUPMATE_BOOST = 3;
const MAX_REVISIONS = 3;
const KEEP_REVISING = 0.45;

/*
 * The contest has a shape. An early front-runner piles up votes while the streets are
 * still quiet; a standout arrives mid-evening and pulls some of those voters back to their
 * ballots. The front-runner's fans are also the nervous ones, resubmitting the same choice.
 * Whether the standout truly overtakes depends on the seed, but every edit and resubmit
 * still sits in the feed as a row, so counting rows flatters the front-runner.
 */
const FRONT_RUNNER_ARRIVES_BY = 3600;
const FRONT_RUNNER_POPULARITY = 14;
const STANDOUT_ARRIVES_FROM = 3600;
const STANDOUT_ARRIVES_BY = 2 * 3600;
const STANDOUT_POPULARITY_MIN = 2;
const STANDOUT_POPULARITY_MAX = 6;
const REVISE_CHANCE = 0.25;
const REVISE_CHANCE_FRONT_RUNNER = 0.6;
const SWITCH_TO_STANDOUT = 0.5;
const RESUBMIT = 0.15;
const RESUBMIT_FRONT_RUNNER = 0.6;

function byText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** When each present kid first scanned a door. Scans arrive in true-time order. */
function firstScans(scans: readonly DoorScan[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const scan of scans) {
    if (!first.has(scan.kidId)) first.set(scan.kidId, scan.nightSecond);
  }
  return first;
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rng.float() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  const last = items.at(-1);
  if (last === undefined) throw new RangeError("pickWeighted() needs at least one item.");
  return last;
}

/**
 * Every ballot submission of the night, in true-time order. Only kids who scanned a door
 * vote, and only for other kids already out by then. A few voters revise their ballots,
 * mostly after a standout costume appears mid-evening.
 */
export function generateCostumeVotes(
  runSeed: string,
  kids: readonly TrickOrTreater[],
  scans: readonly DoorScan[],
): CostumeVote[] {
  const firstScan = firstScans(scans);
  // Kids in roster order, so iteration never depends on Map insertion from the scans.
  const present = kids.filter((kid) => firstScan.has(kid.kidId));
  const arrival = (kid: TrickOrTreater) => firstScan.get(kid.kidId) ?? VOTING_CLOSES;

  const looks = townRng(runSeed, "costume-votes:popularity");
  // Most costumes are fine; a handful stop people in the street.
  const popularity = new Map(present.map((kid) => [kid.kidId, 0.3 + looks.float() ** 4 * 2]));
  const early = present.filter((kid) => arrival(kid) < FRONT_RUNNER_ARRIVES_BY);
  const frontRunner = early.length > 0 ? looks.pick(early).kidId : undefined;
  if (frontRunner) popularity.set(frontRunner, FRONT_RUNNER_POPULARITY);
  const midEvening = present.filter(
    (kid) => arrival(kid) >= STANDOUT_ARRIVES_FROM && arrival(kid) < STANDOUT_ARRIVES_BY,
  );
  const standout = midEvening.length > 0 ? looks.pick(midEvening) : undefined;
  if (standout) {
    const pull =
      STANDOUT_POPULARITY_MIN + looks.float() * (STANDOUT_POPULARITY_MAX - STANDOUT_POPULARITY_MIN);
    popularity.set(standout.kidId, pull);
  }

  const rng = townRng(runSeed, "costume-votes:ballots");
  const voterShare = VOTER_SHARE_MIN + rng.float() * (VOTER_SHARE_MAX - VOTER_SHARE_MIN);

  const choose = (voter: TrickOrTreater, at: number, avoid?: string): string | undefined => {
    const options = present.filter(
      (kid) => kid.kidId !== voter.kidId && kid.kidId !== avoid && arrival(kid) < at,
    );
    if (options.length === 0) return undefined;
    return pickWeighted(rng, options, (kid) => {
      const base = popularity.get(kid.kidId) ?? 0;
      return kid.groupId === voter.groupId ? base * GROUPMATE_BOOST : base;
    }).kidId;
  };

  const casts: Omit<CostumeVote, "ballotId" | "castAtLocal" | "utcOffset">[] = [];
  // Exactly the drawn share of the kids out in time to vote cast a ballot, picked by a
  // partial shuffle in roster order, so late arrivals can't drag turnout below it.
  const lastChance = (kid: TrickOrTreater) =>
    Math.min(MAX_LOOK_AROUND, VOTING_CLOSES - arrival(kid));
  const canVote = present.filter((kid) => lastChance(kid) > MIN_LOOK_AROUND);
  const pool = [...canVote];
  const voterCount = Math.round(voterShare * pool.length);
  for (let i = 0; i < voterCount; i++) {
    const j = rng.int(i, pool.length);
    [pool[i], pool[j]] = [pool[j] as TrickOrTreater, pool[i] as TrickOrTreater];
  }
  const voters = new Set(pool.slice(0, voterCount).map((kid) => kid.kidId));

  for (const voter of canVote) {
    if (!voters.has(voter.kidId)) continue;
    // The vote always lands before the close.
    let at = arrival(voter) + rng.int(MIN_LOOK_AROUND, lastChance(voter));
    let entrant = choose(voter, at);
    if (entrant === undefined) continue;
    casts.push({ revision: 1, voterKidId: voter.kidId, entrantKidId: entrant, nightSecond: at });

    if (rng.float() >= (entrant === frontRunner ? REVISE_CHANCE_FRONT_RUNNER : REVISE_CHANCE)) {
      continue;
    }
    for (let revision = 2; revision <= MAX_REVISIONS + 1; revision++) {
      // Edits come a while after the vote they replace: something made the voter rethink.
      at += rng.int(10 * 60, 80 * 60);
      if (at >= VOTING_CLOSES) break;
      if (
        standout &&
        standout.kidId !== voter.kidId &&
        standout.kidId !== entrant &&
        arrival(standout) < at &&
        rng.float() < SWITCH_TO_STANDOUT
      ) {
        // Won over: the voter's mind is made up, so this is their last edit.
        casts.push({
          revision,
          voterKidId: voter.kidId,
          entrantKidId: standout.kidId,
          nightSecond: at,
        });
        break;
      }
      // A nervous resubmit is a new revision that changes nothing; otherwise a new pick.
      if (rng.float() >= (entrant === frontRunner ? RESUBMIT_FRONT_RUNNER : RESUBMIT)) {
        entrant = choose(voter, at, entrant) ?? entrant;
      }
      casts.push({ revision, voterKidId: voter.kidId, entrantKidId: entrant, nightSecond: at });
      if (rng.float() >= KEEP_REVISING) break;
    }
  }

  // Ballots are numbered in the order their first vote was cast.
  const firstCasts = casts
    .filter((cast) => cast.revision === 1)
    .sort((a, b) => a.nightSecond - b.nightSecond || byText(a.voterKidId, b.voterKidId));
  const ballotOf = new Map(
    firstCasts.map((cast, i) => [cast.voterKidId, `BAL-${String(i + 1).padStart(4, "0")}`]),
  );

  return casts
    .map((cast) => {
      const ballotId = ballotOf.get(cast.voterKidId);
      if (ballotId === undefined)
        throw new RangeError(`${cast.voterKidId} has edits but no first vote.`);
      const clock = clockAt(cast.nightSecond);
      return {
        ballotId,
        ...cast,
        castAtLocal: clock.local,
        utcOffset: clock.utcOffset,
      };
    })
    .sort(
      (a, b) =>
        a.nightSecond - b.nightSecond || byText(a.ballotId, b.ballotId) || a.revision - b.revision,
    );
}

/**
 * The contest as it truly stands: each ballot counts once, for its highest revision. Most
 * votes first, ties broken by kid id so the order is stable.
 */
export function trueStandings(votes: readonly CostumeVote[]): Standing[] {
  const latest = new Map<string, CostumeVote>();
  for (const vote of votes) {
    const current = latest.get(vote.ballotId);
    if (!current || vote.revision > current.revision) latest.set(vote.ballotId, vote);
  }
  const tally = new Map<string, number>();
  for (const vote of latest.values()) {
    tally.set(vote.entrantKidId, (tally.get(vote.entrantKidId) ?? 0) + 1);
  }
  return [...tally]
    .map(([entrantKidId, count]) => ({ entrantKidId, votes: count }))
    .sort((a, b) => b.votes - a.votes || byText(a.entrantKidId, b.entrantKidId));
}

/** The `costume_votes` feed: every submission, with only the ballot box's view of time. */
export function costumeVoteRows(votes: readonly CostumeVote[]): Row[] {
  return votes.map((vote) => ({
    ballot_id: vote.ballotId,
    revision: vote.revision,
    voter_kid_id: vote.voterKidId,
    entrant_kid_id: vote.entrantKidId,
    cast_at_local: vote.castAtLocal,
    utc_offset: vote.utcOffset,
  }));
}
