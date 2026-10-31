import { describe, expect, it } from "vitest";
import { validatePuzzleData, type PuzzleData, type Row } from "../../puzzle";
import { drawPossession, possess } from "../../curses/possession";
import { generateContext, generatePuzzle } from "../../registry";
import { generateNight } from "../../world/night";
import { CURSED_PIECES, cursedHouses, piecesBeforeBell } from "./cursed";
import { BELL_BATCH, LAST_BATCH } from "./delivery";
import { streetList } from "./narrative";
import { GOLD_TABLE, thirteenthDoor } from "./puzzle";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const BELL_LOCAL = "2026-10-31 19:00:00";
const FEEDS = ["bowl_stock", "candy_bowls", "candy_catalog", "door_scans", "houses"];
// A few MB per hour at most (CLAUDE.md section 7); this hour should be far below.
const SIZE_BUDGET_BYTES = 1_000_000;

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new Error(`${column} is not text: ${String(value)}`);
  return value;
}

function num(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== "number") throw new Error(`${column} is not a number: ${String(value)}`);
  return value;
}

/** Every row a feed delivered in batches 0..last, as the player's bronze table holds them. */
function delivered(data: PuzzleData, feed: string, last: number): Row[] {
  return data.batches.slice(0, last + 1).flatMap((batch) => batch.feeds[feed] ?? []);
}

/**
 * Gold rows from a per-house piece count, finished the way a player would: streets from the
 * town directory, every street tied for the most cursed houses.
 */
function goldFrom(data: PuzzleData, pieces: ReadonlyMap<string, number>) {
  const streetOf = new Map(
    delivered(data, "houses", 0).map((h) => [text(h, "house_id"), text(h, "street")]),
  );
  const tally = new Map<string, number>();
  for (const [house, count] of pieces) {
    const street = streetOf.get(house);
    if (count !== CURSED_PIECES || street === undefined) continue;
    tally.set(street, (tally.get(street) ?? 0) + 1);
  }
  const most = Math.max(...tally.values());
  return [...tally]
    .filter(([, count]) => count === most)
    .map(([street, count]) => ({ street, cursed_houses: count }))
    .sort((a, b) => (a.street < b.street ? -1 : 1));
}

/** Each scale's readings, by default only those before the bell, in the scale's own order. */
function scaleReadings(data: PuzzleData, last: number, beforeBell = true) {
  const rows = delivered(data, "candy_bowls", last).filter(
    (r) => !beforeBell || text(r, "read_at_local") < BELL_LOCAL,
  );
  const byDevice = Map.groupBy(rows, (r) => text(r, "device_id"));
  for (const own of byDevice.values()) own.sort((a, b) => num(a, "seq") - num(b, "seq"));
  return byDevice;
}

function candyOf(data: PuzzleData) {
  const catalog = new Map(
    delivered(data, "candy_catalog", 0).map((r) => [text(r, "candy_type"), r] as const),
  );
  return new Map(
    delivered(data, "bowl_stock", 0).map((stock) => {
      const candy = catalog.get(text(stock, "candy_type"));
      if (!candy) throw new Error("Stock names a candy the catalog lacks.");
      const info = {
        houseId: text(stock, "house_id"),
        grams: num(candy, "grams_per_piece"),
        bag: num(candy, "pieces_per_bag"),
      };
      return [text(stock, "device_id"), info] as const;
    }),
  );
}

/**
 * The intended reasoning, from the feeds alone: weight changes become pieces through the
 * candy's weight, rounding away the scale's noise, and a rise is a whole bag tipped in, less
 * whatever was taken in the same moment.
 */
function reasonedPieces(data: PuzzleData, last: number, beforeBell = true) {
  const candy = candyOf(data);
  const pieces = new Map([...candy.values()].map((info) => [info.houseId, 0]));
  for (const [deviceId, own] of scaleReadings(data, last, beforeBell)) {
    const info = candy.get(deviceId);
    if (!info) throw new Error(`No stock for ${deviceId}`);
    let taken = 0;
    for (let i = 1; i < own.length; i++) {
      const [prev, next] = [own[i - 1], own[i]];
      if (!prev || !next) throw new Error("missing reading");
      const change = Math.round((num(next, "weight_g") - num(prev, "weight_g")) / info.grams);
      taken += change <= 0 ? -change : Math.ceil(change / info.bag) * info.bag - change;
    }
    pieces.set(info.houseId, taken);
  }
  return pieces;
}

/** The half-careful pipeline: every drop counted, every rise set aside as a refill. */
function droppedPieces(data: PuzzleData, last: number) {
  const candy = candyOf(data);
  const pieces = new Map<string, number>();
  for (const [deviceId, own] of scaleReadings(data, last)) {
    const info = candy.get(deviceId);
    if (!info) throw new Error(`No stock for ${deviceId}`);
    const drops = own.slice(1).map((next, i) => {
      const prev = own[i];
      if (!prev) throw new Error("missing reading");
      return Math.round((num(next, "weight_g") - num(prev, "weight_g")) / info.grams);
    });
    pieces.set(
      info.houseId,
      drops.reduce((sum, change) => sum + Math.max(0, -change), 0),
    );
  }
  return pieces;
}

/** The hurried pipeline: weight lost between the first and last reading before the bell. */
function weightLostPieces(data: PuzzleData, last: number) {
  const candy = candyOf(data);
  const pieces = new Map<string, number>();
  for (const [deviceId, own] of scaleReadings(data, last)) {
    const info = candy.get(deviceId);
    const [first, final] = [own[0], own.at(-1)];
    if (!info || !first || !final) throw new Error(`No readings for ${deviceId}`);
    pieces.set(
      info.houseId,
      Math.round((num(first, "weight_g") - num(final, "weight_g")) / info.grams),
    );
  }
  return pieces;
}

/** The other hurried pipeline: one piece per knock at the door before the bell. */
function scannedPieces(data: PuzzleData, last: number) {
  const pieces = new Map<string, number>();
  for (const scan of delivered(data, "door_scans", last)) {
    if (text(scan, "scanned_at_local") >= BELL_LOCAL) continue;
    const house = text(scan, "house_id");
    pieces.set(house, (pieces.get(house) ?? 0) + 1);
  }
  return pieces;
}

const runs = SEEDS.map((seed) => ({ seed, data: generatePuzzle(thirteenthDoor, seed) }));
const expectedAt = (data: PuzzleData, checkpoint: string) =>
  data.expected[checkpoint]?.[GOLD_TABLE] ?? [];

describe("the cursed street's name", () => {
  it("names one, two, or three tied streets", () => {
    expect(streetList(["Lantern Row"])).toBe("Lantern Row");
    expect(streetList(["Lantern Row", "Wick Street"])).toBe("Lantern Row and Wick Street");
    expect(streetList(["Bone Lane", "Lantern Row", "Wick Street"])).toBe(
      "Bone Lane, Lantern Row, and Wick Street",
    );
  });
});

describe("the thirteenth door", () => {
  it("is the same for the same seed", () => {
    expect(generatePuzzle(thirteenthDoor, "raven-pumpkin-13")).toEqual(
      generatePuzzle(thirteenthDoor, "raven-pumpkin-13"),
    );
  });

  it("differs between seeds", () => {
    const a = generatePuzzle(thirteenthDoor, "raven-pumpkin-13");
    const b = generatePuzzle(thirteenthDoor, "raven-pumpkin-14");
    expect(a.batches).not.toEqual(b.batches);
    expect(a.narrative).not.toEqual(b.narrative);
    const answers = new Set(runs.map(({ data }) => JSON.stringify(expectedAt(data, "bell"))));
    expect(answers.size).toBeGreaterThan(10);
  });

  /*
   * These two only break a pipeline when chance lines up against it: a group of 13 kids can
   * walk a street whose tally happens to match, and a cursed house can sit quiet past 7pm. The
   * weight-lost trap, which the night is planted to break, is checked on every seed below.
   */
  it("mostly breaks a pipeline that counts door scans as pieces", () => {
    const broken = runs.filter(
      ({ data }) =>
        JSON.stringify(goldFrom(data, scannedPieces(data, BELL_BATCH))) !==
        JSON.stringify(expectedAt(data, "bell")),
    );
    expect(broken.length).toBeGreaterThanOrEqual(18);
  });

  it("mostly breaks a pipeline that keeps counting after the bell", () => {
    const broken = runs.filter(
      ({ data }) =>
        JSON.stringify(goldFrom(data, reasonedPieces(data, LAST_BATCH, false))) !==
        JSON.stringify(expectedAt(data, "proclamation")),
    );
    expect(broken.length).toBeGreaterThanOrEqual(18);
  });

  // Rarer still: a bag torn open with a kid at the door has to land on a house near 13.
  it("sometimes breaks a pipeline that sets every rise aside", () => {
    const broken = runs.filter(
      ({ data }) =>
        JSON.stringify(goldFrom(data, droppedPieces(data, BELL_BATCH))) !==
        JSON.stringify(expectedAt(data, "bell")),
    );
    expect(broken.length).toBeGreaterThan(0);
  });

  describe.each(runs)("seed $seed", ({ seed, data }) => {
    const bell = expectedAt(data, "bell");

    it("is valid puzzle data, with every feed in every batch and in batch 0", () => {
      expect(validatePuzzleData(thirteenthDoor, data)).toEqual([]);
      for (const batch of data.batches) expect(Object.keys(batch.feeds).sort()).toEqual(FEEDS);
      for (const feed of FEEDS) expect(data.batches[0]?.feeds[feed]?.length).toBeGreaterThan(0);
      expect(data.batches.length).toBe(thirteenthDoor.retention);
      expect(data.batches[BELL_BATCH]?.arrivesAt).toBe(BELL_LOCAL);
    });

    it("has cursed houses, and the same answer at the bell and after it", () => {
      expect(bell.length).toBeGreaterThan(0);
      for (const row of bell) expect(Object.keys(row).sort()).toEqual(["cursed_houses", "street"]);
      expect(expectedAt(data, "proclamation")).toEqual(bell);
    });

    it("can be worked out from the scales, the stock, and the catalog alone", () => {
      const truth = piecesBeforeBell(generateNight(seed).candyBowls);
      expect(reasonedPieces(data, BELL_BATCH)).toEqual(truth);
      expect(reasonedPieces(data, LAST_BATCH)).toEqual(truth);
      expect(goldFrom(data, reasonedPieces(data, BELL_BATCH))).toEqual(bell);
    });

    it("breaks a pipeline that reads weight lost as pieces given", () => {
      expect(goldFrom(data, weightLostPieces(data, BELL_BATCH))).not.toEqual(bell);
    });

    it("binds every number and name its story quotes", () => {
      const { narrative } = data;
      expect(narrative.cursed_on_street).toBe(bell[0]?.cursed_houses);
      expect(narrative.cursed_street).toBe(streetList(bell.map((r) => text(r, "street"))));
      const night = generateNight(seed);
      const cursed = new Set(cursedHouses(night.candyBowls));
      const [lowest] = night.houses
        .filter((h) => cursed.has(h.houseId) && h.street === bell[0]?.street)
        .sort((a, b) => a.number - b.number);
      expect(narrative.cursed_household).toBe(lowest?.household);
      expect(narrative.cursed_count).toBeGreaterThanOrEqual(Number(narrative.cursed_on_street));
      expect(narrative.bags_sold).toBeGreaterThanOrEqual(Number(narrative.bowl_count));
      expect(narrative.bowl_count).toBe(delivered(data, "bowl_stock", 0).length);
      const knocks = delivered(data, "door_scans", BELL_BATCH);
      expect(narrative.scans_before_bell).toBe(
        knocks.filter((s) => text(s, "scanned_at_local") < BELL_LOCAL).length,
      );
    });

    it("lets the Curse of Possession twist the scale's weight column", () => {
      const possession = drawPossession(
        thirteenthDoor,
        data,
        generateContext(thirteenthDoor, seed),
      );
      if (!possession) throw new Error("The hour declares a possessable column.");
      expect(possession.fromBatch).toBeGreaterThan(0);
      const possessed = possess(data, possession);
      expect(possessed.expected).toEqual(data.expected);
    });

    it("stays within its size budget", () => {
      expect(JSON.stringify(data).length).toBeLessThan(SIZE_BUDGET_BYTES);
    });
  });
});
