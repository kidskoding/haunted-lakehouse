import { describe, expect, it } from "vitest";
import type { Batch, Puzzle, PuzzleData, Row } from "../puzzle";
import { generatePuzzle } from "../registry";
import { fakePuzzle } from "../testing/fake-puzzle";
import { bowlReadingRows, generateCandyBowls, type BowlReading } from "../world/candy-bowls";
import { generateDoorScans } from "../world/door-scans";
import { generateHouses } from "../world/houses";
import { generatePorchLights } from "../world/porch-lights";
import { NIGHT_SECONDS } from "../world/night-clock";
import { generateTrickOrTreaters } from "../world/trick-or-treaters";
import { generateHour } from "./apply";
import { possess, possessionOptions, type Possession } from "./possession";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const HALF_HOUR = 30 * 60;

const possessedFake = fakePuzzle({
  possessable: [{ feed: "readings", column: "value", aliases: ["reading"], unit: "pts" }],
});

/** Gold the bowl hour expects: each house's latest true weight, from the scales' own records. */
function latestWeights(readings: readonly BowlReading[], until: number): Row[] {
  const latest = new Map<string, number>();
  for (const r of readings) if (r.nightSecond <= until) latest.set(r.houseId, r.weightG);
  return [...latest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([house_id, weight_g]) => ({ house_id, weight_g }));
}

/**
 * An hour over the real candy bowl feed: readings land every half hour across the night, and
 * gold holds each house's latest weight at three checkpoints.
 */
const bowlHour: Puzzle = {
  id: "bowl-hour",
  slot: 3,
  title: "The Bowl Hour",
  prerequisites: [],
  retention: 2,
  visibleBatchCount: 10,
  goldTables: ["gold.bowl_weights"],
  possessable: [
    { feed: "candy_bowls", column: "weight_g", aliases: ["weight_grams", "wt"], unit: "g" },
    { feed: "candy_bowls", column: "read_at_local", aliases: ["read_at"] },
  ],
  generate({ runSeed }): PuzzleData {
    const houses = generateHouses(runSeed);
    const scans = generateDoorScans(runSeed, houses, generateTrickOrTreaters(runSeed, houses));
    const { lights } = generatePorchLights(runSeed, houses, scans);
    const { readings } = generateCandyBowls(runSeed, houses, scans, lights);
    const count = NIGHT_SECONDS / HALF_HOUR;
    const landsAt = (index: number) => (index + 1) * HALF_HOUR;
    // A reading lands with the first batch at or after it.
    const batchOf = (r: BowlReading) =>
      Math.min(count - 1, Math.max(0, Math.ceil(r.nightSecond / HALF_HOUR) - 1));
    const batches = Array.from({ length: count }, (_, index): Batch => ({
      index,
      arrivesAt: String(landsAt(index)),
      feeds: { candy_bowls: bowlReadingRows(readings.filter((r) => batchOf(r) === index)) },
    }));
    const checkpoints = [2, 9, count - 1].map((afterBatch) => ({
      id: `after-${String(afterBatch)}`,
      afterBatch,
      label: String(landsAt(afterBatch)),
    }));
    return {
      batches,
      checkpoints,
      expected: Object.fromEntries(
        checkpoints.map(({ id, afterBatch }) => [
          id,
          { "gold.bowl_weights": latestWeights(readings, landsAt(afterBatch)) },
        ]),
      ),
      narrative: { scales: houses.filter((h) => h.givesCandy).length },
    };
  },
};

function rowsOf(batches: readonly Batch[], feed: string): Row[] {
  return batches.flatMap((batch) => batch.feeds[feed] ?? []);
}

describe("possessionOptions", () => {
  it("offers each rename, then the stringify, in declaration order", () => {
    expect(possessionOptions(bowlHour).map(({ column, change }) => [column, change])).toEqual([
      ["weight_g", { kind: "rename", to: "weight_grams" }],
      ["weight_g", { kind: "rename", to: "wt" }],
      ["weight_g", { kind: "stringify", unit: "g" }],
      ["read_at_local", { kind: "rename", to: "read_at" }],
    ]);
  });

  it("offers nothing for a puzzle that declares nothing", () => {
    expect(possessionOptions(fakePuzzle())).toEqual([]);
  });

  it("rejects a declaration that offers no change, or renames a column to itself", () => {
    expect(() =>
      possessionOptions(fakePuzzle({ possessable: [{ feed: "readings", column: "value" }] })),
    ).toThrow(/into nothing/);
    expect(() =>
      possessionOptions(
        fakePuzzle({ possessable: [{ feed: "readings", column: "value", aliases: ["value"] }] }),
      ),
    ).toThrow(/to itself/);
  });
});

describe("possess", () => {
  const data = generatePuzzle(fakePuzzle(), "raven-pumpkin-13");

  it("renames the column in place from its batch on", () => {
    const possessed = possess(data, {
      feed: "readings",
      column: "value",
      fromBatch: 2,
      change: { kind: "rename", to: "reading" },
    });
    expect(possessed.batches.slice(0, 2)).toEqual(data.batches.slice(0, 2));
    expect(possessed.batches[2]?.feeds.readings).toEqual([
      { reading: data.batches[2]?.feeds.readings?.[0]?.value },
    ]);
  });

  it("writes the unit into values but leaves nulls null", () => {
    const withNull: PuzzleData = {
      ...data,
      batches: [
        { index: 0, arrivesAt: "18:00", feeds: { readings: [{ value: 7 }, { value: null }] } },
      ],
    };
    const possessed = possess(withNull, {
      feed: "readings",
      column: "value",
      fromBatch: 0,
      change: { kind: "stringify", unit: "g" },
    });
    expect(possessed.batches[0]?.feeds.readings).toEqual([{ value: "7 g" }, { value: null }]);
  });

  it("refuses a feed that never arrives, or a rename onto a column the feed has", () => {
    const base: Omit<Possession, "change"> = { feed: "readings", column: "value", fromBatch: 1 };
    expect(() =>
      possess(data, { ...base, feed: "ghosts", change: { kind: "rename", to: "x" } }),
    ).toThrow(/never arrives/);
    const twoColumns: PuzzleData = {
      ...data,
      batches: [{ index: 0, arrivesAt: "18:00", feeds: { readings: [{ value: 1, at: 2 }] } }],
    };
    expect(() => possess(twoColumns, { ...base, change: { kind: "rename", to: "at" } })).toThrow(
      /already has/,
    );
  });
});

describe("the Curse of Possession", () => {
  it("drifts the fake feed from its middle batch, changing only the delivered rows", () => {
    const clean = generatePuzzle(possessedFake, "raven-pumpkin-13");
    const hour = generateHour(possessedFake, "raven-pumpkin-13", "possession");
    expect(hour.possession?.fromBatch).toBe(1);
    expect(hour.data.batches[0]).toEqual(clean.batches[0]);
    expect(hour.data.batches.slice(1)).not.toEqual(clean.batches.slice(1));
    expect(hour.data.checkpoints).toEqual(clean.checkpoints);
    expect(hour.data.expected).toEqual(clean.expected);
    expect(hour.data.narrative).toEqual(clean.narrative);
    expect(hour.retention).toBe(possessedFake.retention);
  });

  it("passes by a puzzle that declares nothing possessable", () => {
    const puzzle = fakePuzzle();
    const hour = generateHour(puzzle, "raven-pumpkin-13", "possession");
    expect(hour.possession).toBeNull();
    expect(hour.data).toEqual(generatePuzzle(puzzle, "raven-pumpkin-13"));
  });

  it("passes by a night too short to turn halfway", () => {
    const oneBatch: Puzzle = {
      ...possessedFake,
      generate: (context) => {
        const data = possessedFake.generate(context);
        return {
          ...data,
          batches: data.batches.slice(0, 1),
          checkpoints: [{ id: "early", afterBatch: 0, label: "18:05" }],
        };
      },
    };
    expect(generateHour(oneBatch, "raven-pumpkin-13", "possession").possession).toBeNull();
  });

  describe.each(SEEDS)("on the real bowl feed, seed %s", (seed) => {
    const clean = generatePuzzle(bowlHour, seed);
    const hour = generateHour(bowlHour, seed, "possession");
    const possession = hour.possession;
    const count = clean.batches.length;

    it("lands in the middle third of the night", () => {
      expect(possession).not.toBeNull();
      expect(possession?.fromBatch).toBeGreaterThanOrEqual(Math.floor(count / 3));
      expect(possession?.fromBatch).toBeLessThan(Math.ceil((2 * count) / 3));
    });

    it("changes delivered rows from that batch on, and nothing else", () => {
      const from = possession?.fromBatch ?? 0;
      expect(hour.data.batches.slice(0, from)).toEqual(clean.batches.slice(0, from));
      const before = rowsOf(clean.batches.slice(from), "candy_bowls");
      const after = rowsOf(hour.data.batches.slice(from), "candy_bowls");
      expect(after).toHaveLength(before.length);
      expect(before.length).toBeGreaterThan(0);
      after.forEach((row, i) => {
        expect(row).not.toEqual(before[i]);
      });
      expect(hour.data.checkpoints).toEqual(clean.checkpoints);
      expect(hour.data.narrative).toEqual(clean.narrative);
    });

    it("leaves expected gold exactly as the clean night's", () => {
      expect(hour.data.expected).toEqual(clean.expected);
    });

    it("is the same possession every time for this seed and slot", () => {
      expect(generateHour(bowlHour, seed, "possession")).toEqual(hour);
    });
  });

  it("strikes different columns, changes, and batches across seeds", () => {
    const draws = new Set(
      SEEDS.map((seed) => JSON.stringify(generateHour(bowlHour, seed, "possession").possession)),
    );
    const columns = new Set(
      SEEDS.map((seed) => generateHour(bowlHour, seed, "possession").possession?.column),
    );
    const starts = new Set(
      SEEDS.map((seed) => generateHour(bowlHour, seed, "possession").possession?.fromBatch),
    );
    expect(draws.size).toBeGreaterThan(5);
    expect(columns.size).toBe(2);
    expect(starts.size).toBeGreaterThan(1);
  });

  it("draws from the hour's own slot, so the same puzzle in another slot drifts differently", () => {
    const elsewhere: Puzzle = { ...bowlHour, slot: 4 };
    const differs = SEEDS.some(
      (seed) =>
        JSON.stringify(generateHour(bowlHour, seed, "possession").possession) !==
        JSON.stringify(generateHour(elsewhere, seed, "possession").possession),
    );
    expect(differs).toBe(true);
    // The generator itself ignores the slot here, so only the curse's stream moved.
    expect(generatePuzzle(elsewhere, "seed-0")).toEqual(generatePuzzle(bowlHour, "seed-0"));
  });
});
