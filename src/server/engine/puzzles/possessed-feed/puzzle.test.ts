import { describe, expect, it } from "vitest";
import { validatePuzzleData, type Cell, type PuzzleData, type Row } from "../../puzzle";
import { fogNarrative } from "../../curses/fog";
import { generatePuzzle } from "../../registry";
import { generateHouses } from "../../world/houses";
import { generatePumpkinSensors } from "../../world/pumpkin-sensors";
import { FEED, GOLD_TABLE, HIDDEN_FROM, possessedFeed } from "./puzzle";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const SIZE_BUDGET = 1_000_000;
// The autopsy promises the retype breaks a strict cast at once, so that holds on far more seeds.
const RETYPE_SEEDS = 120;

// Written from the design doc's rules, independently of the generator's spellings module.
const ITEM_NAMES = new Set(["candle", "fog juice", "cobweb", "lantern", "skeleton", "glow stick"]);
const WORDS =
  "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(
    " ",
  );
const DOZENS: Readonly<Record<string, number>> = {
  "half a dozen": 6,
  "a dozen": 12,
  "two dozen": 24,
};

/** A count, or null when the text is not one: the design doc's recovery rule. */
function readQuantity(value: Cell): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const text = value.toLowerCase();
  const digits = /^(\d+)( (pcs|units))?$/.exec(text);
  if (digits) return Number.parseInt(digits[1] ?? "", 10);
  const word = WORDS.indexOf(text);
  if (word >= 0) return word + 1;
  return DOZENS[text] ?? null;
}

/** A count the rules can read but a strict cast can't: units, words, or dozens. */
const isTricky = (value: Cell) =>
  typeof value === "string" && !/^\d+$/.test(value) && readQuantity(value) !== null;

/** What a hurried `try_cast(... as integer)` makes of a value. */
function castQuantity(value: Cell): number | null {
  if (typeof value === "number") return value;
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}

type Shape = "clean" | "renamed" | "retyped" | "reordered";

function shapeOf(row: Row): Shape {
  if ("qty" in row) return "clean";
  if (typeof row.quantity === "number") return "renamed";
  return ITEM_NAMES.has(String(row.quantity)) ? "reordered" : "retyped";
}

/** The row's item and quantity text, with the reorder undone and the rename followed. */
function placed(row: Row): { item: string; quantity: Cell } {
  const quantity = "qty" in row ? (row.qty ?? null) : (row.quantity ?? null);
  return shapeOf(row) === "reordered"
    ? { item: String(quantity), quantity: row.item ?? null }
    : { item: String(row.item), quantity };
}

function rowsThrough(data: PuzzleData, lastBatch: number): Row[] {
  return data.batches.slice(0, lastBatch + 1).flatMap((batch) => batch.feeds[FEED] ?? []);
}

type Reader = (value: Cell) => number | null;

/** The tally a pipeline would produce. `keepUnread` false drops what it can't read. */
function tally(rows: readonly Row[], read: Reader, keepUnread: boolean): Row[] {
  const totals = new Map<string, { pieces: number; disputed: number }>();
  for (const row of rows) {
    const { item, quantity } = placed(row);
    const count = read(quantity);
    if (count === null && !keepUnread) continue;
    const total = totals.get(item) ?? { pieces: 0, disputed: 0 };
    if (count === null) total.disputed += 1;
    else total.pieces += count;
    totals.set(item, total);
  }
  return [...totals.entries()].map(([item, total]) => ({ item, ...total }));
}

const sorted = (rows: readonly Row[]) =>
  [...rows].sort((a, b) => (String(a.item) < String(b.item) ? -1 : 1));

const allData = SEEDS.map((seed) => ({ seed, data: generatePuzzle(possessedFeed, seed) }));

function firstBatchOf(data: PuzzleData, shape: Shape): number {
  return data.batches.findIndex((batch) =>
    (batch.feeds[FEED] ?? []).some((r) => shapeOf(r) === shape),
  );
}

function checkpointBatch(data: PuzzleData, id: string): number {
  const checkpoint = data.checkpoints.find((c) => c.id === id);
  if (!checkpoint) throw new Error(`No checkpoint ${id}.`);
  return checkpoint.afterBatch;
}

describe("the possessed feed", () => {
  it("lets the Fog withhold only the vague spelling the Mayor quotes", () => {
    const { narrative } = generatePuzzle(possessedFeed, "seed-0");
    const fogged = fogNarrative(possessedFeed, narrative);
    expect(fogged.withheld).toEqual(["example_vague"]);
    expect(fogged.narrative).not.toHaveProperty("example_vague");
  });

  it("produces data the puzzle validator accepts", () => {
    for (const { data } of allData) expect(validatePuzzleData(possessedFeed, data)).toEqual([]);
  });

  it("is the same for the same seed and differs between seeds", () => {
    const [first] = allData;
    expect(generatePuzzle(possessedFeed, first?.seed ?? "")).toEqual(first?.data);
    allData.forEach(({ data }, i) => {
      // Each seed against the next, wrapping around, so every pair is two different seeds.
      const other = allData[(i + 1) % allData.length]?.data;
      expect(data.batches).not.toEqual(other?.batches);
      expect(data.expected).not.toEqual(other?.expected);
    });
  });

  it("lands nine uploads from 18:10 to 19:30, the first never empty", () => {
    for (const { data } of allData) {
      expect(data.batches.map((b) => b.arrivesAt.slice(11, 16))).toEqual([
        "18:10",
        "18:20",
        "18:30",
        "18:40",
        "18:50",
        "19:00",
        "19:10",
        "19:20",
        "19:30",
      ]);
      expect(data.batches[0]?.feeds[FEED]?.length).toBeGreaterThan(0);
    }
  });

  it("changes shape three times, in order, each before the checkpoint that must catch it", () => {
    const order: Shape[] = ["clean", "renamed", "retyped", "reordered"];
    for (const { data } of allData) {
      let previous = 0;
      for (const batch of data.batches) {
        const shapes = new Set((batch.feeds[FEED] ?? []).map(shapeOf));
        // Each possession takes the whole batch: a batch never mixes shapes.
        expect(shapes.size).toBeLessThanOrEqual(1);
        for (const shape of shapes) {
          expect(order.indexOf(shape)).toBeGreaterThanOrEqual(previous);
          previous = order.indexOf(shape);
        }
      }
      const renamed = firstBatchOf(data, "renamed");
      const retyped = firstBatchOf(data, "retyped");
      const reordered = firstBatchOf(data, "reordered");
      expect([1, 2]).toContain(renamed);
      expect([3, 4]).toContain(retyped);
      expect([5, 6]).toContain(reordered);
      expect(renamed).toBeLessThanOrEqual(checkpointBatch(data, "first-look"));
      expect(retyped).toBeLessThanOrEqual(checkpointBatch(data, "seven-oclock"));
      expect(reordered).toBeLessThan(HIDDEN_FROM);
    }
  });

  it("possesses values that can be read and values that can't, before seven and after dark", () => {
    for (const { data } of allData) {
      const quantities = (from: number, to: number) =>
        data.batches
          .slice(from, to + 1)
          .flatMap((b) => (b.feeds[FEED] ?? []).map((r) => placed(r).quantity));
      const beforeSeven = quantities(0, checkpointBatch(data, "seven-oclock"));
      expect(beforeSeven.some(isTricky)).toBe(true);
      expect(beforeSeven.some((q) => readQuantity(q) === null)).toBe(true);

      const visible = new Set(quantities(0, HIDDEN_FROM - 1).map((q) => String(q).toLowerCase()));
      const hidden = quantities(HIDDEN_FROM, data.batches.length - 1);
      expect(hidden.some((q) => readQuantity(q) === null)).toBe(true);
      expect(hidden.some((q) => isTricky(q) && !visible.has(String(q).toLowerCase()))).toBe(true);
    }
  });

  it("expects exactly the tally the delivered rows give under the story's rules", () => {
    for (const { data } of allData) {
      for (const checkpoint of data.checkpoints) {
        const derived = tally(rowsThrough(data, checkpoint.afterBatch), readQuantity, true);
        expect(sorted(derived)).toEqual(sorted(data.expected[checkpoint.id]?.[GOLD_TABLE] ?? []));
      }
    }
  });

  it("fails the pipelines that drop or null what a cast can't read, on every seed", () => {
    for (const { data } of allData) {
      const seven = data.checkpoints.find((c) => c.id === "seven-oclock");
      if (!seven) throw new Error("No seven o'clock checkpoint.");
      const expected = sorted(data.expected[seven.id]?.[GOLD_TABLE] ?? []);
      const rows = rowsThrough(data, seven.afterBatch);
      expect(sorted(tally(rows, castQuantity, false))).not.toEqual(expected);
      expect(sorted(tally(rows, castQuantity, true))).not.toEqual(expected);
    }
  });

  it("breaks a strict cast at the first check after the text arrives, on every seed", () => {
    for (let i = 0; i < RETYPE_SEEDS; i++) {
      const seed = `retype-seed-${String(i)}`;
      const data = generatePuzzle(possessedFeed, seed);
      const retyped = firstBatchOf(data, "retyped");
      const quantities = (data.batches[retyped]?.feeds[FEED] ?? []).map((r) => placed(r).quantity);
      expect(quantities.some(isTricky), `${seed}'s retype batch`).toBe(true);

      const check = data.checkpoints.find((c) => c.afterBatch >= retyped);
      if (!check) throw new Error("No check follows the retype.");
      const expected = sorted(data.expected[check.id]?.[GOLD_TABLE] ?? []);
      const rows = rowsThrough(data, check.afterBatch);
      expect(sorted(tally(rows, castQuantity, false))).not.toEqual(expected);
      expect(sorted(tally(rows, castQuantity, true))).not.toEqual(expected);
    }
  }, 30_000);

  it("drops only at real houses, with candles only where there is a jack-o'-lantern", () => {
    for (const { seed, data } of allData) {
      // The town and its pumpkins are all the night this needs, and far cheaper to build.
      const town = generateHouses(seed);
      const houses = new Set(town.map((h) => h.houseId));
      const pumpkins = new Set(generatePumpkinSensors(seed, town).sensors.map((s) => s.houseId));
      const rows = rowsThrough(data, data.batches.length - 1);
      const ids = rows.map((r) => r.drop_id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const row of rows) {
        expect(houses.has(String(row.house_id))).toBe(true);
        if (placed(row).item === "candle") expect(pumpkins.has(String(row.house_id))).toBe(true);
      }
      expect(data.narrative.drop_count).toBe(rows.length);
    }
  });

  it("shows every item before the columns trade places", () => {
    for (const { data } of allData) {
      const early = rowsThrough(data, firstBatchOf(data, "reordered") - 1);
      expect(new Set(early.map((r) => r.item))).toEqual(ITEM_NAMES);
    }
  });

  it("quotes Hobb's note from spellings the player can see", () => {
    for (const { data } of allData) {
      const visible = new Set(rowsThrough(data, HIDDEN_FROM - 1).map((r) => placed(r).quantity));
      for (const key of ["example_unit", "example_word", "example_dozen", "example_vague"]) {
        expect(visible.has(data.narrative[key] ?? null)).toBe(true);
      }
      expect(data.narrative.example_vague).not.toBe("");
      const pieces = (data.expected.invoice?.[GOLD_TABLE] ?? []).reduce(
        (sum, row) => sum + Number(row.pieces),
        0,
      );
      // The invoice bills what the vague drops really held, so it always beats the tally.
      expect(data.narrative.invoiced_pieces).toBeGreaterThan(pieces);
    }
  });

  it("counts what the story says was read, lost to a strict cast, and disputed", () => {
    for (const { data } of allData) {
      const rows = rowsThrough(data, data.batches.length - 1);
      const raw = (row: Row): Cell => ("qty" in row ? (row.qty ?? null) : (row.quantity ?? null));
      const readable = rows.filter((row) => readQuantity(placed(row).quantity) !== null);
      const pieces = (data.expected.invoice?.[GOLD_TABLE] ?? []).reduce(
        (sum, row) => sum + Number(row.pieces),
        0,
      );
      expect(data.narrative.paid_pieces).toBe(pieces);
      expect(data.narrative.unknown_rows).toBe(rows.length - readable.length);
      expect(data.narrative.recovered_rows).toBe(
        readable.filter((row) => castQuantity(raw(row)) === null).length,
      );
      expect(data.narrative.swapped_rows).toBe(
        rows.filter((row) => shapeOf(row) === "reordered").length,
      );
      expect(data.narrative.unknown_rows).toBeGreaterThan(0);
      expect(data.narrative.recovered_rows).toBeGreaterThan(0);
    }
  });

  it("stays small", () => {
    for (const { data } of allData) {
      expect(JSON.stringify(data).length).toBeLessThan(SIZE_BUDGET);
    }
  });
});
