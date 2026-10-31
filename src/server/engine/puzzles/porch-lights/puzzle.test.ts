import { describe, expect, it } from "vitest";
import { validatePuzzleData, type PuzzleData, type Row } from "../../puzzle";
import { generatePuzzle } from "../../registry";
import { porchLights } from "./index";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const GOLD = "gold.welcoming_houses";
const FEED = "porch_lights";
const ROW_BUDGET = 400;
const BYTE_BUDGET = 100_000;

const runs = SEEDS.map((seed) => ({ seed, data: generatePuzzle(porchLights, seed) }));

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new Error(`${column} is not text in ${JSON.stringify(row)}`);
  return value;
}

function whole(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== "number") throw new Error(`${column} is not a number`);
  return value;
}

/** The feed's rows as bronze would hold them after a batch, retention keeping the whole hour. */
function delivered(data: PuzzleData, afterBatch: number): Row[] {
  return data.batches.slice(0, afterBatch + 1).flatMap((b) => b.feeds[FEED] ?? []);
}

/** What a correct pipeline computes from the delivered rows: each house's latest change by seq. */
function reference(rows: readonly Row[]): number {
  const latest = new Map<string, Row>();
  for (const row of rows) {
    const known = latest.get(text(row, "house_id"));
    if (!known || whole(row, "seq") > whole(known, "seq")) latest.set(text(row, "house_id"), row);
  }
  return [...latest.values()].filter((row) => text(row, "state") === "on").length;
}

/** The trap: every house with any `on` report, however long ago. */
function trap(rows: readonly Row[]): number {
  return new Set(rows.filter((r) => text(r, "state") === "on").map((r) => text(r, "house_id")))
    .size;
}

function expectedHouses(data: PuzzleData, checkpointId: string): number {
  const [row] = data.expected[checkpointId]?.[GOLD] ?? [];
  if (!row) throw new Error(`No expected ${GOLD} at ${checkpointId}.`);
  return whole(row, "houses");
}

function narrative(data: PuzzleData, key: string): number {
  const value = data.narrative[key];
  if (typeof value !== "number") throw new Error(`Narrative ${key} is not a number.`);
  return value;
}

describe("porch lights puzzle", () => {
  it("is the slot 1 tutorial with one gold table and no prerequisites", () => {
    expect(porchLights).toMatchObject({
      id: "porch-lights",
      slot: 1,
      title: "Porch Lights",
      prerequisites: [],
      goldTables: [GOLD],
    });
  });

  it("generates the same night for the same seed", () => {
    expect(generatePuzzle(porchLights, "raven-pumpkin-13")).toEqual(
      generatePuzzle(porchLights, "raven-pumpkin-13"),
    );
  });

  it("generates a different night for a different seed", () => {
    const a = generatePuzzle(porchLights, "raven-pumpkin-13");
    const b = generatePuzzle(porchLights, "raven-pumpkin-14");
    expect(a.batches).not.toEqual(b.batches);
    expect(a.expected).not.toEqual(b.expected);
  });

  it("varies its answers across seeds", () => {
    const finals = new Set(runs.map(({ data }) => expectedHouses(data, "quarter-to")));
    expect(finals.size).toBeGreaterThan(5);
  });

  it("shuffles some reports within their batch and delays a few on some nights", () => {
    const shuffled = runs.filter(({ data }) =>
      data.batches.some((batch) => {
        const times = (batch.feeds[FEED] ?? []).map((r) => text(r, "changed_at_local"));
        return times.some((t, i) => i > 0 && t < (times[i - 1] ?? ""));
      }),
    );
    expect(shuffled.length).toBe(SEEDS.length);
    // A row is late when it changed by the time the batch before it landed.
    const late = runs.filter(({ data }) =>
      data.batches.some((batch) => {
        const previous = data.batches[batch.index - 1]?.arrivesAt;
        return (batch.feeds[FEED] ?? []).some(
          (r) => previous !== undefined && text(r, "changed_at_local") <= previous,
        );
      }),
    );
    expect(late.length).toBeGreaterThan(SEEDS.length / 2);
  });

  it("keeps the trap's number above the truth on screen in every night", () => {
    for (const { data } of runs) {
      expect(narrative(data, "switched_off")).toBeGreaterThan(0);
      expect(narrative(data, "ever_lit")).toBe(
        expectedHouses(data, "quarter-to") + narrative(data, "switched_off"),
      );
    }
  });

  it("has dead sensors still claiming a dark porch is lit on some nights", () => {
    const stuck = runs.filter(({ data }) => narrative(data, "dark_but_counted") > 0);
    expect(stuck.length).toBeGreaterThanOrEqual(4);
    for (const { data } of runs) {
      expect(narrative(data, "dark_but_counted")).toBeLessThanOrEqual(
        expectedHouses(data, "quarter-to"),
      );
    }
  });

  describe.each(runs)("seed $seed", ({ data }) => {
    const houseCount = narrative(data, "house_count");

    it("passes the puzzle data checks", () => {
      expect(validatePuzzleData(porchLights, data)).toEqual([]);
    });

    it("lands a batch every five minutes from 18:05 to 18:45, and keeps them all", () => {
      expect(data.batches.map((b) => b.arrivesAt.slice(11, 16))).toEqual([
        "18:05",
        "18:10",
        "18:15",
        "18:20",
        "18:25",
        "18:30",
        "18:35",
        "18:40",
        "18:45",
      ]);
      expect(porchLights.retention).toBe(data.batches.length);
    });

    it("delivers only the porch-light feed, with rows in the first batch", () => {
      for (const batch of data.batches) expect(Object.keys(batch.feeds)).toEqual([FEED]);
      expect(data.batches[0]?.feeds[FEED]?.length).toBeGreaterThan(0);
    });

    it("never delivers a change before it happened", () => {
      for (const batch of data.batches) {
        for (const row of batch.feeds[FEED] ?? []) {
          expect(text(row, "changed_at_local") <= batch.arrivesAt).toBe(true);
          expect(text(row, "utc_offset")).toBe("-05:00");
        }
      }
    });

    it("has the Mayor look at 18:15, 18:30 and 18:45, in order", () => {
      expect(data.checkpoints).toEqual([
        { id: "quarter-past", afterBatch: 2, label: "18:15" },
        { id: "half-past", afterBatch: 5, label: "18:30" },
        { id: "quarter-to", afterBatch: 8, label: "18:45" },
      ]);
    });

    it("expects each house's latest delivered change, counted where it is on", () => {
      for (const { id, afterBatch } of data.checkpoints) {
        expect(data.expected[id]).toEqual({
          [GOLD]: [{ houses: reference(delivered(data, afterBatch)) }],
        });
        const houses = expectedHouses(data, id);
        expect(houses).toBeGreaterThan(0);
        expect(houses).toBeLessThanOrEqual(houseCount);
      }
    });

    it("breaks the trap, which counts every porch ever switched on", () => {
      const half = data.checkpoints.find((c) => c.id === "half-past");
      if (!half) throw new Error("No half-past checkpoint.");
      expect(trap(delivered(data, half.afterBatch))).toBeGreaterThan(
        expectedHouses(data, "half-past"),
      );
    });

    it("binds every story number as a whole number", () => {
      for (const value of Object.values(data.narrative)) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(narrative(data, "lit_at_quarter_past")).toBe(expectedHouses(data, "quarter-past"));
      expect(narrative(data, "lit_at_half_past")).toBe(expectedHouses(data, "half-past"));
      expect(narrative(data, "lit_at_last_checkpoint")).toBe(expectedHouses(data, "quarter-to"));
      expect(narrative(data, "dark_but_counted")).toBeLessThanOrEqual(
        narrative(data, "silent_sensors"),
      );
      expect(narrative(data, "truly_lit")).toBeLessThanOrEqual(houseCount);
    });

    it("stays small", () => {
      expect(delivered(data, data.batches.length - 1).length).toBeLessThan(ROW_BUDGET);
      expect(JSON.stringify(data).length).toBeLessThan(BYTE_BUDGET);
    });
  });
});
