import type { Puzzle, PuzzleData } from "../puzzle";

/**
 * A tiny puzzle for engine tests: one feed of seeded readings over three batches, with a
 * gold table holding the running total at two checkpoints.
 */
export function fakePuzzle(overrides: Partial<Omit<Puzzle, "generate">> = {}): Puzzle {
  return {
    id: "fake",
    slot: 1,
    title: "A Fake Hour",
    prerequisites: [],
    retention: 2,
    visibleBatchCount: 2,
    goldTables: ["gold.totals"],
    goldColumns: { "gold.totals": ["total"] },
    ...overrides,
    generate({ rng }): PuzzleData {
      const readings = rng("readings");
      const batches = [0, 1, 2].map((index) => ({
        index,
        arrivesAt: `18:${String(index * 10).padStart(2, "0")}`,
        feeds: { readings: [{ value: readings.int(0, 100) }] },
      }));
      const totalAfter = (last: number) =>
        batches
          .slice(0, last + 1)
          .reduce((sum, batch) => sum + (batch.feeds.readings[0]?.value ?? 0), 0);
      return {
        batches,
        checkpoints: [
          { id: "early", afterBatch: 0, label: "18:05" },
          { id: "late", afterBatch: 2, label: "18:25" },
        ],
        expected: {
          early: { "gold.totals": [{ total: totalAfter(0) }] },
          late: { "gold.totals": [{ total: totalAfter(2) }] },
        },
        narrative: { finalTotal: totalAfter(2) },
      };
    },
  };
}
