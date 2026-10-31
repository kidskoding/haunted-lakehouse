import { describe, expect, it } from "vitest";
import { generateCandyBowls } from "./candy-bowls";
import { candyLedgerRows, holdingsAt, type HoldingVersion } from "./candy-ledger";
import { candyTradeRows, generateCandyTrades } from "./candy-trades";
import { generateDoorScans } from "./door-scans";
import { generateHouses } from "./houses";
import { FALL_BACK_SECOND, NIGHT_SECONDS, secondsAt } from "./night-clock";
import { generatePorchLights } from "./porch-lights";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const ROW_BUDGET = 50_000;
const HOUR = 3600;

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  const { lights } = generatePorchLights(seed, houses, scans);
  const { handouts } = generateCandyBowls(seed, houses, scans, lights);
  return { kids, scans, handouts, ...generateCandyTrades(seed, kids, handouts) };
}

const key = (kidId: string, candyType: string) => `${kidId}|${candyType}`;

/** Replays the ledger feed's rows in lsn order, as a correct pipeline would, into versions. */
function replay(rows: readonly ReturnType<typeof candyLedgerRows>[number][]): HoldingVersion[] {
  const versions: { -readonly [K in keyof HoldingVersion]: HoldingVersion[K] }[] = [];
  const open = new Map<string, (typeof versions)[number]>();
  const sorted = [...rows].sort((a, b) => Number(a.lsn) - Number(b.lsn));
  for (const row of sorted) {
    const [second] = secondsAt(String(row.changed_at_local)).filter((s) =>
      row.utc_offset === "-05:00" ? s < FALL_BACK_SECOND : s >= FALL_BACK_SECOND,
    );
    if (second === undefined) throw new Error(`Unreadable time in lsn ${String(row.lsn)}`);
    const k = key(String(row.kid_id), String(row.candy_type));
    const current = open.get(k);
    if (current) current.validTo = second;
    open.delete(k);
    if (row.op !== "delete") {
      const version = {
        kidId: String(row.kid_id),
        candyType: String(row.candy_type),
        pieces: Number(row.pieces),
        validFrom: second,
        validTo: null,
        lsn: Number(row.lsn),
      };
      versions.push(version);
      open.set(k, version);
    }
  }
  return versions.sort(
    (a, b) =>
      (a.kidId < b.kidId ? -1 : a.kidId > b.kidId ? 1 : 0) ||
      (a.candyType < b.candyType ? -1 : a.candyType > b.candyType ? 1 : 0) ||
      a.validFrom - b.validFrom,
  );
}

const allNights = SEEDS.map(night);

describe("candy trades", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13")).toEqual(night("raven-pumpkin-13"));
  });

  it("differ between seeds", () => {
    const a = night("raven-pumpkin-13");
    const b = night("raven-pumpkin-14");
    expect(a.trades).not.toEqual(b.trades);
    expect(a.ledger).not.toEqual(b.ledger);
  });

  it("happen in both 1am hours every night", () => {
    const both = allNights.filter(({ trades }) => {
      const first = trades.some(
        (t) => t.nightSecond >= 7 * HOUR && t.nightSecond < FALL_BACK_SECOND,
      );
      const second = trades.some(
        (t) => t.nightSecond >= FALL_BACK_SECOND && t.nightSecond < FALL_BACK_SECOND + HOUR,
      );
      return first && second;
    });
    expect(both).toHaveLength(allNights.length);
  });

  it("include every venue, swaps and gifts", () => {
    const trades = allNights.flatMap((n) => n.trades);
    expect(new Set(trades.map((t) => t.venue))).toEqual(
      new Set(["walk", "co-op-table", "swap-meet"]),
    );
    const gifts = trades.filter((t) => t.legs.length === 1).length;
    expect(gifts / trades.length).toBeGreaterThan(0.05);
    expect(gifts / trades.length).toBeLessThan(0.4);
  });

  it("become feed rows with only the ledger's view of time", () => {
    const { trades, ledger } = night("raven-pumpkin-13");
    const trade = trades.find((t) => t.legs.length === 2);
    const [change] = ledger;
    if (!trade || !change) throw new Error("The night has no trades.");
    expect(candyTradeRows([trade])).toEqual(
      trade.legs.map((l) => ({
        trade_id: trade.tradeId,
        giver_kid_id: l.giverKidId,
        receiver_kid_id: l.receiverKidId,
        candy_type: l.candyType,
        pieces: l.pieces,
        traded_at_local: trade.tradedAtLocal,
        utc_offset: trade.utcOffset,
      })),
    );
    expect(candyLedgerRows([change])).toEqual([
      {
        lsn: 1,
        op: "insert",
        kid_id: change.kidId,
        candy_type: change.candyType,
        pieces: change.pieces,
        changed_at_local: change.changedAtLocal,
        utc_offset: change.utcOffset,
        trade_id: null,
      },
    ]);
  });

  describe.each(SEEDS.map((seed, i) => [seed, allNights[i]] as const))("seed %s", (_, data) => {
    if (!data) throw new Error("missing night");
    const { kids, handouts, trades, ledger, history } = data;
    const legs = trades.flatMap((t) => t.legs.map((l) => ({ ...l, nightSecond: t.nightSecond })));

    it("has a modest share of kids trading, some more than once", () => {
      const perKid = new Map<string, number>();
      for (const t of trades) {
        for (const kidId of new Set(t.legs.flatMap((l) => [l.giverKidId, l.receiverKidId]))) {
          perKid.set(kidId, (perKid.get(kidId) ?? 0) + 1);
        }
      }
      expect(perKid.size / kids.length).toBeGreaterThan(0.1);
      expect(perKid.size / kids.length).toBeLessThan(0.7);
      expect([...perKid.values()].some((n) => n > 1)).toBe(true);
    });

    it("numbers the ledger 1..n in true-time order, within the budget", () => {
      expect(ledger.map((c) => c.lsn)).toEqual(ledger.map((_, i) => i + 1));
      for (let i = 1; i < ledger.length; i++) {
        expect(ledger[i]?.nightSecond).toBeGreaterThanOrEqual(ledger[i - 1]?.nightSecond ?? 0);
      }
      expect(ledger.length + legs.length).toBeLessThan(ROW_BUDGET);
      expect(trades.map((t) => t.tradeId)).toEqual(
        trades.map((_, i) => `TR-${String(i + 1).padStart(4, "0")}`),
      );
    });

    it("logs one change per handout and two per trade leg", () => {
      expect(ledger.filter((c) => c.tradeId === null)).toHaveLength(handouts.length);
      expect(ledger.filter((c) => c.tradeId !== null)).toHaveLength(2 * legs.length);
    });

    it("keeps every time within the night, with clock faces that match", () => {
      for (const c of ledger) {
        expect(c.nightSecond).toBeGreaterThanOrEqual(0);
        expect(c.nightSecond).toBeLessThan(NIGHT_SECONDS);
        expect(secondsAt(c.changedAtLocal)).toContain(c.nightSecond);
        expect(c.utcOffset).toBe(c.nightSecond < FALL_BACK_SECOND ? "-05:00" : "-06:00");
      }
      for (const t of trades) expect(secondsAt(t.tradedAtLocal)).toContain(t.nightSecond);
    });

    it("changes each kid's candy at most once a second", () => {
      const seen = ledger.map((c) => `${key(c.kidId, c.candyType)}@${String(c.nightSecond)}`);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it("inserts from zero, deletes only at zero, and never goes negative", () => {
      const balance = new Map<string, number>();
      const changesByTrade = Map.groupBy(
        ledger.filter((c) => c.tradeId !== null),
        (c) => c.tradeId,
      );
      for (const t of trades) {
        const own = changesByTrade.get(t.tradeId) ?? [];
        for (const c of own) expect(c.nightSecond).toBe(t.nightSecond);
      }
      for (const c of ledger) {
        const k = key(c.kidId, c.candyType);
        const before = balance.get(k) ?? 0;
        const after = c.pieces ?? 0;
        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).not.toBe(before);
        if (c.op === "insert") expect(before).toBe(0);
        if (c.op === "update") expect(before > 0 && after > 0).toBe(true);
        if (c.op === "delete") {
          expect(before).toBeGreaterThan(0);
          expect(c.pieces).toBeNull();
        }
        if (c.pieces !== null) expect(c.pieces).toBeGreaterThan(0);
        balance.set(k, after);
      }
    });

    it("trades only between kids who were out, once both had candy, giving what they held", () => {
      const firstScan = new Map<string, number>();
      for (const h of handouts) if (!firstScan.has(h.kidId)) firstScan.set(h.kidId, h.nightSecond);
      for (const l of legs) {
        expect(l.giverKidId).not.toBe(l.receiverKidId);
        expect(l.pieces).toBeGreaterThan(0);
        for (const kidId of [l.giverKidId, l.receiverKidId]) {
          expect(l.nightSecond).toBeGreaterThan(firstScan.get(kidId) ?? Infinity);
        }
        const held = holdingsAt(history, l.nightSecond - 1).find(
          (h) => h.kidId === l.giverKidId && h.candyType === l.candyType,
        );
        expect(held?.pieces ?? 0).toBeGreaterThanOrEqual(l.pieces);
      }
      for (const t of trades) {
        const [first, second] = t.legs;
        if (first && second) {
          expect(second.giverKidId).toBe(first.receiverKidId);
          expect(second.candyType).not.toBe(first.candyType);
        }
      }
    });

    it("never has a kid at a door during a table trade", () => {
      const lastScan = new Map<string, number>();
      for (const h of handouts) lastScan.set(h.kidId, h.nightSecond);
      for (const t of trades.filter((tr) => tr.venue !== "walk")) {
        for (const l of t.legs) {
          expect(t.nightSecond).toBeGreaterThan(lastScan.get(l.giverKidId) ?? Infinity);
          expect(t.nightSecond).toBeGreaterThan(lastScan.get(l.receiverKidId) ?? Infinity);
        }
      }
      const groupOf = new Map(kids.map((k) => [k.kidId, k.groupId]));
      for (const t of trades.filter((tr) => tr.venue === "walk")) {
        for (const l of t.legs)
          expect(groupOf.get(l.giverKidId)).toBe(groupOf.get(l.receiverKidId));
      }
    });

    it("replays, in lsn order, to exactly the true history", () => {
      const shuffled = [...candyLedgerRows(ledger)].reverse();
      expect(replay(shuffled)).toEqual(history);
    });

    it("ends with each kid holding what they collected, plus and minus their trades", () => {
      const expected = new Map<string, number>();
      const add = (k: string, n: number) => expected.set(k, (expected.get(k) ?? 0) + n);
      for (const h of handouts) add(key(h.kidId, h.candyType), h.pieces);
      for (const l of legs) {
        add(key(l.giverKidId, l.candyType), -l.pieces);
        add(key(l.receiverKidId, l.candyType), l.pieces);
      }
      const final = new Map(
        holdingsAt(history, NIGHT_SECONDS).map((h) => [key(h.kidId, h.candyType), h.pieces]),
      );
      for (const [k, pieces] of expected) expect(final.get(k) ?? 0).toBe(pieces);
      for (const k of final.keys()) expect(expected.has(k)).toBe(true);
    });

    it("conserves every candy type across trades", () => {
      const collected = Map.groupBy(handouts, (h) => h.candyType);
      const held = Map.groupBy(holdingsAt(history, NIGHT_SECONDS), (h) => h.candyType);
      for (const [type, own] of collected) {
        const total = own.reduce((sum, h) => sum + h.pieces, 0);
        expect((held.get(type) ?? []).reduce((sum, h) => sum + h.pieces, 0)).toBe(total);
      }
      expect([...held.keys()].every((type) => collected.has(type))).toBe(true);
    });

    it("keeps each balance's versions in order, never overlapping, gapped only by deletes", () => {
      const deletes = new Set(
        ledger
          .filter((c) => c.op === "delete")
          .map((c) => `${key(c.kidId, c.candyType)}@${String(c.nightSecond)}`),
      );
      for (const versions of Map.groupBy(history, (v) => key(v.kidId, v.candyType)).values()) {
        for (const [i, v] of versions.entries()) {
          expect(v.pieces).toBeGreaterThan(0);
          if (v.validTo !== null) expect(v.validTo).toBeGreaterThan(v.validFrom);
          const next = versions[i + 1];
          if (!next) continue;
          expect(v.validTo).not.toBeNull();
          const end = v.validTo ?? Infinity;
          expect(end).toBeLessThanOrEqual(next.validFrom);
          if (end < next.validFrom) {
            expect(deletes.has(`${key(v.kidId, v.candyType)}@${String(end)}`)).toBe(true);
          }
        }
      }
    });
  });
});
