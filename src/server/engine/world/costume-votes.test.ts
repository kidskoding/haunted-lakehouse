import { describe, expect, it } from "vitest";
import {
  costumeVoteRows,
  generateCostumeVotes,
  trueStandings,
  type CostumeVote,
} from "./costume-votes";
import { generateDoorScans } from "./door-scans";
import { generateHouses } from "./houses";
import { FALL_BACK_SECOND, NIGHT_SECONDS, secondsAt } from "./night-clock";
import { generateTrickOrTreaters } from "./trick-or-treaters";

// seed-20 has enough late arrivals that dropping them once cut turnout below 60%.
const SEEDS = Array.from({ length: 21 }, (_, i) => `seed-${String(i)}`);

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  return { kids, scans, votes: generateCostumeVotes(seed, kids, scans) };
}

/** The leader when every submission counts, as a hurried count over the raw feed would. */
function naiveWinner(votes: readonly CostumeVote[]): string | undefined {
  const all = votes.map((vote, i) => ({ ...vote, ballotId: `row-${String(i)}` }));
  return trueStandings(all)[0]?.entrantKidId;
}

function vote(ballotId: string, revision: number, entrantKidId: string): CostumeVote {
  return {
    ballotId,
    revision,
    voterKidId: `voter-${ballotId}`,
    entrantKidId,
    nightSecond: revision,
    castAtLocal: "2026-10-31 19:00:00",
    utcOffset: "-05:00",
  };
}

describe("costume votes", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13").votes).toEqual(night("raven-pumpkin-13").votes);
  });

  it("differ between seeds", () => {
    expect(night("raven-pumpkin-13").votes).not.toEqual(night("raven-pumpkin-14").votes);
  });

  it("become feed rows with only the ballot box's view of time", () => {
    const [first] = night("raven-pumpkin-13").votes;
    if (!first) throw new Error("The night has no votes.");
    expect(costumeVoteRows([first])).toEqual([
      {
        ballot_id: first.ballotId,
        revision: first.revision,
        voter_kid_id: first.voterKidId,
        entrant_kid_id: first.entrantKidId,
        cast_at_local: first.castAtLocal,
        utc_offset: first.utcOffset,
      },
    ]);
  });

  it("count only each ballot's highest revision, whatever order rows arrive in", () => {
    const votes = [vote("B", 2, "K-2"), vote("A", 1, "K-1"), vote("B", 1, "K-1")];
    expect(trueStandings(votes)).toEqual([
      { entrantKidId: "K-1", votes: 1 },
      { entrantKidId: "K-2", votes: 1 },
    ]);
  });

  it("crown a different winner than counting every row in some seeds", () => {
    const misled = SEEDS.filter((seed) => {
      const { votes } = night(seed);
      return naiveWinner(votes) !== trueStandings(votes)[0]?.entrantKidId;
    });
    expect(misled.length).toBeGreaterThanOrEqual(3);
    expect(misled.length).toBeLessThan(SEEDS.length);
  });

  describe.each(SEEDS)("seed %s", (seed) => {
    const { kids, scans, votes } = night(seed);
    const firstScan = new Map<string, number>();
    for (const scan of scans) {
      if (!firstScan.has(scan.kidId)) firstScan.set(scan.kidId, scan.nightSecond);
    }
    const ballots = Map.groupBy(votes, (v) => v.ballotId);

    it("come from most, but not all, of the kids out in time to vote", () => {
      const canVote = [...firstScan.values()].filter((at) => at + 60 < 4 * 3600).length;
      const share = ballots.size / canVote;
      // The drawn share is 60–85%; a voter only drops out if nobody else was out yet.
      expect(share).toBeGreaterThan(0.58);
      expect(share).toBeLessThan(0.86);
    });

    it("fall within the night, in true-time order", () => {
      for (const [i, v] of votes.entries()) {
        expect(v.nightSecond).toBeGreaterThan(0);
        expect(v.nightSecond).toBeLessThan(NIGHT_SECONDS);
        expect(v.nightSecond).toBeGreaterThanOrEqual(votes[i - 1]?.nightSecond ?? 0);
        expect(secondsAt(v.castAtLocal)).toContain(v.nightSecond);
        expect(v.utcOffset).toBe(v.nightSecond < FALL_BACK_SECOND ? "-05:00" : "-06:00");
      }
    });

    it("are cast by and for real kids who were out, never for themselves", () => {
      const kidIds = new Set(kids.map((k) => k.kidId));
      for (const v of votes) {
        expect(kidIds.has(v.voterKidId)).toBe(true);
        expect(kidIds.has(v.entrantKidId)).toBe(true);
        expect(firstScan.has(v.voterKidId)).toBe(true);
        expect(firstScan.has(v.entrantKidId)).toBe(true);
        expect(v.entrantKidId).not.toBe(v.voterKidId);
      }
    });

    it("give each voter one ballot, first cast after their first door scan", () => {
      const voters = new Set<string>();
      for (const rows of ballots.values()) {
        const [first] = rows;
        if (!first) throw new Error("A ballot has no rows.");
        expect(rows.every((v) => v.voterKidId === first.voterKidId)).toBe(true);
        expect(voters.has(first.voterKidId)).toBe(false);
        voters.add(first.voterKidId);
        expect(first.nightSecond).toBeGreaterThan(firstScan.get(first.voterKidId) ?? Infinity);
      }
    });

    it("number each ballot's revisions 1 to n, each later than the last", () => {
      for (const rows of ballots.values()) {
        expect(rows.map((v) => v.revision)).toEqual(rows.map((_, i) => i + 1));
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i]?.nightSecond ?? 0).toBeGreaterThan(rows[i - 1]?.nightSecond ?? 0);
        }
      }
    });

    it("include revisions, some of which change the vote", () => {
      const revised = [...ballots.values()].filter((rows) => rows.length > 1);
      const share = revised.length / ballots.size;
      expect(share).toBeGreaterThan(0.15);
      expect(share).toBeLessThan(0.45);
      const changed = revised.filter((rows) => new Set(rows.map((v) => v.entrantKidId)).size > 1);
      expect(changed.length).toBeGreaterThan(0);
    });
  });
});
