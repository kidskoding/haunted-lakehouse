import { describe, expect, it } from "vitest";
import { CANDY_CATALOG } from "./candy";
import { isLit } from "./porch-lights";
import { FALL_BACK_SECOND, NIGHT_SECONDS, type UtcOffset } from "./night-clock";
import { generateNight, type Night, type NightFeeds } from "./night";
import { NIGHT_START_EPOCH } from "./pumpkin-sensors";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const MINUTE = 60;
const HOUR = 3600;
// Members of a group scan up to 9 seconds apart, so a door's last scan trails its first by 27.
const DOOR_LINGER = 27;
const NOISE_G = 2;

const gramsOf = new Map(CANDY_CATALOG.map((c) => [c.candyType, c.gramsPerPiece]));

/** A timestamp as a feed ships it, next to the true second it should encode. */
interface Stamp {
  readonly feed: string;
  readonly nightSecond: number;
  readonly local: string;
  readonly utcOffset: UtcOffset;
}

function stamps(night: Night): Stamp[] {
  return [
    ...night.doorScans.map((s) => ({ feed: "door_scans", local: s.scannedAtLocal, ...s })),
    ...night.hayrideTaps.map((t) => ({ feed: "hayride_taps", local: t.tappedAtLocal, ...t })),
    ...night.costumeVotes.map((v) => ({ feed: "costume_votes", local: v.castAtLocal, ...v })),
    ...night.porchLights.events.map((e) => ({
      feed: "porch_lights",
      local: e.changedAtLocal,
      ...e,
    })),
    ...night.candyBowls.readings.map((r) => ({ feed: "candy_bowls", local: r.readAtLocal, ...r })),
    ...night.candyTrades.trades.map((t) => ({
      feed: "candy_trades",
      local: t.tradedAtLocal,
      ...t,
    })),
    ...night.candyTrades.ledger.map((c) => ({
      feed: "candy_ledger",
      local: c.changedAtLocal,
      ...c,
    })),
  ].map(({ feed, nightSecond, local, utcOffset }) => ({ feed, nightSecond, local, utcOffset }));
}

/** Unix seconds of a zone-less `YYYY-MM-DD HH:MM:SS` read as UTC. */
function epochOf(text: string): number {
  return Date.parse(`${text.replace(" ", "T")}Z`) / 1000;
}

/** The instant a local clock face names, as Unix seconds. */
function instantOf(local: string, utcOffset: UtcOffset): number {
  return epochOf(local) + (utcOffset === "-05:00" ? 5 : 6) * HOUR;
}

/** Each ledger change as the pieces it added or removed, found by replaying in lsn order. */
function ledgerDeltas(night: Night) {
  const balances = new Map<string, number>();
  return [...night.candyTrades.ledger]
    .sort((a, b) => a.lsn - b.lsn)
    .map((change) => {
      const key = `${change.kidId}|${change.candyType}`;
      const after = change.pieces ?? 0;
      const delta = after - (balances.get(key) ?? 0);
      balances.set(key, after);
      return { ...change, delta };
    });
}

const nights = SEEDS.map((seed) => [seed, generateNight(seed)] as const);
const FEEDS = Object.keys(nights[0]?.[1].feeds ?? {}) as (keyof NightFeeds)[];

describe("the whole night", () => {
  it("is the same for the same seed", () => {
    expect(generateNight("raven-pumpkin-13")).toEqual(generateNight("raven-pumpkin-13"));
  });

  it("differs between seeds in every feed that depends on the seed", () => {
    const a = generateNight("raven-pumpkin-13").feeds;
    const b = generateNight("raven-pumpkin-14").feeds;
    for (const feed of FEEDS) {
      if (feed === "candy_catalog") expect(a[feed]).toEqual(b[feed]);
      else expect(a[feed], feed).not.toEqual(b[feed]);
    }
  });

  it("ships every feed with rows in every seed", () => {
    for (const [, night] of nights) {
      for (const feed of FEEDS) expect(night.feeds[feed].length, feed).toBeGreaterThan(0);
    }
  });
});

describe.each(nights)("seed %s, across feeds", (_, night) => {
  const houseIds = new Set(night.houses.map((h) => h.houseId));
  const givingIds = new Set(night.houses.filter((h) => h.givesCandy).map((h) => h.houseId));
  const kidIds = new Set(night.kids.map((k) => k.kidId));
  const groupOf = new Map(night.kids.map((k) => [k.kidId, k.groupId]));
  const streetOf = new Map(night.houses.map((h) => [h.houseId, h.street]));
  const scansOf = Map.groupBy(night.doorScans, (s) => s.kidId);
  const firstScan = (kidId: string) => scansOf.get(kidId)?.[0]?.nightSecond ?? Infinity;
  const { bowls, handouts, readings } = night.candyBowls;
  const { trades, ledger } = night.candyTrades;

  describe("identity", () => {
    it("references only real houses and kids, in every feed", () => {
      for (const s of night.doorScans) {
        expect(givingIds.has(s.houseId)).toBe(true);
        expect(kidIds.has(s.kidId)).toBe(true);
      }
      for (const kidId of [
        ...night.hayrideTaps.map((t) => t.kidId),
        ...night.costumeVotes.flatMap((v) => [v.voterKidId, v.entrantKidId]),
        ...handouts.map((h) => h.kidId),
        ...trades.flatMap((t) => t.legs.flatMap((l) => [l.giverKidId, l.receiverKidId])),
        ...ledger.map((c) => c.kidId),
      ]) {
        expect(kidIds.has(kidId), kidId).toBe(true);
      }
      for (const houseId of [
        ...night.porchLights.lights.map((l) => l.houseId),
        ...night.porchLights.events.map((e) => e.houseId),
        ...night.pumpkinSensors.sensors.map((s) => s.houseId),
        ...night.pumpkinSensors.readings.map((r) => r.houseId),
      ]) {
        expect(houseIds.has(houseId), houseId).toBe(true);
      }
      for (const houseId of [...bowls.map((b) => b.houseId), ...readings.map((r) => r.houseId)]) {
        expect(givingIds.has(houseId), houseId).toBe(true);
      }
    });

    it("references only candy the Co-op sells", () => {
      for (const candyType of [
        ...bowls.map((b) => b.candyType),
        ...handouts.map((h) => h.candyType),
        ...trades.flatMap((t) => t.legs.map((l) => l.candyType)),
        ...ledger.map((c) => c.candyType),
      ]) {
        expect(gramsOf.has(candyType), candyType).toBe(true);
      }
    });

    it("gives every device one id, used by one feed for one place, unique across all feeds", () => {
      const owners = new Map<string, string>();
      const claim = (feed: string, deviceId: string, place: string) => {
        const owner = `${feed}:${place}`;
        expect(owners.get(deviceId) ?? owner, deviceId).toBe(owner);
        owners.set(deviceId, owner);
      };
      for (const s of night.doorScans) claim("door_scans", s.deviceId, s.houseId);
      for (const t of night.hayrideTaps) claim("hayride_taps", t.deviceId, t.gate);
      for (const l of night.porchLights.lights) claim("porch_lights", l.deviceId, l.houseId);
      for (const e of night.porchLights.events) claim("porch_lights", e.deviceId, e.houseId);
      for (const b of bowls) claim("candy_bowls", b.deviceId, b.houseId);
      for (const r of readings) claim("candy_bowls", r.deviceId, r.houseId);
      for (const s of night.pumpkinSensors.sensors) claim("pumpkins", s.sensorId, s.houseId);
      for (const r of night.pumpkinSensors.readings) claim("pumpkins", r.sensorId, r.houseId);
      for (const h of handouts) claim("door_scans", h.scanDeviceId, h.houseId);
    });
  });

  describe("presence", () => {
    it("shows kids who never knocked on a door in no other feed", () => {
      const present = new Set(scansOf.keys());
      for (const kidId of [
        ...night.hayrideTaps.map((t) => t.kidId),
        ...night.costumeVotes.flatMap((v) => [v.voterKidId, v.entrantKidId]),
        ...trades.flatMap((t) => t.legs.flatMap((l) => [l.giverKidId, l.receiverKidId])),
        ...ledger.map((c) => c.kidId),
      ]) {
        expect(present.has(kidId), kidId).toBe(true);
      }
    });

    it("has no kid vote, trade, or hold candy before their first door", () => {
      for (const v of night.costumeVotes) {
        expect(v.nightSecond).toBeGreaterThan(firstScan(v.voterKidId));
        expect(v.nightSecond).toBeGreaterThan(firstScan(v.entrantKidId));
      }
      for (const c of ledger) expect(c.nightSecond).toBeGreaterThanOrEqual(firstScan(c.kidId));
    });
  });

  describe("physics", () => {
    it("never has a kid at a door while on the hayride", () => {
      const taps = Map.groupBy(night.hayrideTaps, (t) => t.kidId);
      for (const [kidId, own] of taps) {
        const rides = Map.groupBy(own, (t) => (t.direction === "in" ? "in" : "out"));
        const ins = rides.get("in") ?? [];
        const outs = rides.get("out") ?? [];
        expect(ins.length).toBe(outs.length);
        ins.forEach((tapIn, i) => {
          const tapOut = outs[i];
          if (!tapOut) throw new Error(`${kidId} never got off the wagon.`);
          for (const scan of scansOf.get(kidId) ?? []) {
            const onBoard = scan.nightSecond >= tapIn.nightSecond;
            expect(onBoard && scan.nightSecond <= tapOut.nightSecond).toBe(false);
          }
        });
      }
    });

    it("leaves time to walk between doors, and longer between streets", () => {
      for (const own of scansOf.values()) {
        own.forEach((scan, i) => {
          const next = own[i + 1];
          if (!next) return;
          const sameStreet = streetOf.get(scan.houseId) === streetOf.get(next.houseId);
          const walk = sameStreet ? MINUTE : 5 * MINUTE;
          expect(next.houseId).not.toBe(scan.houseId);
          expect(next.nightSecond - scan.nightSecond).toBeGreaterThanOrEqual(walk - DOOR_LINGER);
        });
      }
    });

    it("keeps a group at the same doors, on the same rides, and trading on the walk together", () => {
      const doorsOf = (kidId: string) => (scansOf.get(kidId) ?? []).map((s) => s.houseId);
      const ridesOf = (kidId: string) =>
        night.hayrideTaps.filter((t) => t.kidId === kidId).map((t) => `${t.gate}/${t.direction}`);
      for (const members of Map.groupBy(night.kids, (k) => k.groupId).values()) {
        const [lead, ...rest] = members;
        if (!lead) continue;
        for (const kid of rest) {
          expect(doorsOf(kid.kidId)).toEqual(doorsOf(lead.kidId));
          expect(ridesOf(kid.kidId)).toEqual(ridesOf(lead.kidId));
        }
      }
      for (const trade of trades.filter((t) => t.venue === "walk")) {
        for (const leg of trade.legs) {
          expect(groupOf.get(leg.giverKidId)).toBe(groupOf.get(leg.receiverKidId));
        }
      }
    });
  });

  describe("lights and candy", () => {
    const lightOf = new Map(night.porchLights.lights.map((l) => [l.houseId, l]));
    const bowlOf = new Map(bowls.map((b) => [b.houseId, b]));

    it("only lets kids knock at lit porches with the bowl out", () => {
      for (const scan of night.doorScans) {
        const light = lightOf.get(scan.houseId);
        const bowl = bowlOf.get(scan.houseId);
        if (!light || !bowl) throw new Error(`${scan.houseId} has no light or bowl.`);
        expect(isLit(light, scan.nightSecond)).toBe(true);
        expect(scan.nightSecond).toBeGreaterThan(bowl.setOutAt);
        expect(scan.nightSecond).toBeLessThan(bowl.takenInAt);
      }
    });

    it("sets each bowl out after the porch lights up, and takes it in by lights-out", () => {
      for (const bowl of bowls) {
        const lit = lightOf.get(bowl.houseId)?.lit ?? [];
        expect(bowl.setOutAt).toBeGreaterThanOrEqual(lit[0]?.from ?? Infinity);
        expect(bowl.takenInAt).toBeLessThanOrEqual(lit.at(-1)?.to ?? -Infinity);
        expect(bowl.takenInAt).toBeGreaterThan(bowl.setOutAt);
      }
    });

    it("ties every handout to its door scan, in the house's own candy", () => {
      const scanAt = new Map(night.doorScans.map((s) => [`${s.deviceId}#${String(s.seq)}`, s]));
      expect(handouts.length).toBe(night.doorScans.length);
      const seen = new Set<string>();
      for (const h of handouts) {
        const key = `${h.scanDeviceId}#${String(h.scanSeq)}`;
        const scan = scanAt.get(key);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        expect(scan?.houseId).toBe(h.houseId);
        expect(scan?.kidId).toBe(h.kidId);
        expect(scan?.nightSecond).toBe(h.nightSecond);
        expect(h.candyType).toBe(bowlOf.get(h.houseId)?.candyType);
      }
    });

    it("weighs, as each bowl comes in, what went out less what was handed out", () => {
      const takenBy = Map.groupBy(handouts, (h) => h.houseId);
      const lastReading = new Map(readings.map((r) => [r.deviceId, r]));
      for (const bowl of bowls) {
        const given = (takenBy.get(bowl.houseId) ?? []).reduce((sum, h) => sum + h.pieces, 0);
        const added = bowl.refills.reduce((sum, r) => sum + r.pieces, 0);
        const left = bowl.initialPieces + added - given;
        expect(left).toBeGreaterThanOrEqual(0);
        const reading = lastReading.get(bowl.deviceId);
        expect(reading?.nightSecond).toBe(bowl.takenInAt);
        const grams = left * (gramsOf.get(bowl.candyType) ?? 0);
        expect(Math.abs((reading?.weightG ?? -Infinity) - grams)).toBeLessThanOrEqual(NOISE_G);
      }
    });
  });

  describe("the ledger", () => {
    const deltas = ledgerDeltas(night);

    it("logs each handout as one collection, and nothing else as one", () => {
      const key = (kidId: string, candyType: string, second: number, pieces: number) =>
        `${kidId}|${candyType}|${String(second)}|${String(pieces)}`;
      const collections = deltas
        .filter((c) => c.tradeId === null)
        .map((c) => key(c.kidId, c.candyType, c.nightSecond, c.delta))
        .sort();
      const given = handouts.map((h) => key(h.kidId, h.candyType, h.nightSecond, h.pieces)).sort();
      expect(collections).toEqual(given);
    });

    it("logs each trade as exactly its legs", () => {
      const net = (entries: readonly (readonly [string, number])[]) => {
        const sums = new Map<string, number>();
        for (const [k, d] of entries) sums.set(k, (sums.get(k) ?? 0) + d);
        return [...sums].filter(([, d]) => d !== 0).sort(([a], [b]) => (a < b ? -1 : 1));
      };
      const logged = Map.groupBy(
        deltas.filter((c) => c.tradeId !== null),
        (c) => c.tradeId ?? "",
      );
      expect(logged.size).toBe(trades.length);
      for (const trade of trades) {
        const changes = logged.get(trade.tradeId) ?? [];
        for (const c of changes) expect(c.nightSecond).toBe(trade.nightSecond);
        expect(net(changes.map((c) => [`${c.kidId}|${c.candyType}`, c.delta]))).toEqual(
          net(
            trade.legs.flatMap((l) => [
              [`${l.giverKidId}|${l.candyType}`, -l.pieces],
              [`${l.receiverKidId}|${l.candyType}`, l.pieces],
            ]),
          ),
        );
      }
    });

    it("replays from its feed rows to what each kid collected, plus and minus trades", () => {
      const expected = new Map<string, number>();
      const add = (kidId: string, candyType: string, pieces: number) => {
        const k = `${kidId}|${candyType}`;
        expected.set(k, (expected.get(k) ?? 0) + pieces);
      };
      for (const h of handouts) add(h.kidId, h.candyType, h.pieces);
      for (const leg of trades.flatMap((t) => t.legs)) {
        add(leg.giverKidId, leg.candyType, -leg.pieces);
        add(leg.receiverKidId, leg.candyType, leg.pieces);
      }

      const replayed = new Map<string, number>();
      const rows = [...night.feeds.candy_ledger].sort((a, b) => Number(a.lsn) - Number(b.lsn));
      for (const row of rows) {
        replayed.set(`${String(row.kid_id)}|${String(row.candy_type)}`, Number(row.pieces ?? 0));
      }
      const held = (m: ReadonlyMap<string, number>) =>
        [...m].filter(([, n]) => n !== 0).sort(([a], [b]) => (a < b ? -1 : 1));
      expect(held(replayed)).toEqual(held(expected));
    });
  });

  describe("clocks", () => {
    const all = stamps(night);

    it("puts every feed's local time and offset on the true instant, inside the night", () => {
      for (const s of all) {
        expect(s.nightSecond).toBeGreaterThanOrEqual(0);
        expect(s.nightSecond).toBeLessThanOrEqual(NIGHT_SECONDS);
        expect(instantOf(s.local, s.utcOffset), s.feed).toBe(NIGHT_START_EPOCH + s.nightSecond);
      }
      for (const r of night.pumpkinSensors.readings) {
        expect(epochOf(r.readAtUtc)).toBe(NIGHT_START_EPOCH + r.secondsIntoNight);
        expect(r.secondsIntoNight).toBeLessThan(NIGHT_SECONDS);
      }
    });

    it("stamps the first 1am hour as daylight time and the second as standard, in every feed", () => {
      const oneAm = all.filter((s) => s.local.startsWith("2026-11-01 01:"));
      for (const s of oneAm) {
        expect(s.utcOffset, s.feed).toBe(s.nightSecond < FALL_BACK_SECOND ? "-05:00" : "-06:00");
      }
      const offsets = new Set(oneAm.map((s) => s.utcOffset));
      expect(offsets).toEqual(new Set(["-05:00", "-06:00"]));
    });
  });
});
