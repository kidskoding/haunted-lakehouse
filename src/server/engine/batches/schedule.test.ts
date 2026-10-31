import { describe, expect, it } from "vitest";
import { validatePuzzleData, type Batch, type Row } from "../puzzle";
import { rngFor } from "../random";
import { fakePuzzle } from "../testing/fake-puzzle";
import { generateHouses } from "../world/houses";
import { clockAt } from "../world/night-clock";
import { generatePumpkinSensors } from "../world/pumpkin-sensors";
import type { FeedEvent, Injection } from "./injections";
import { scheduleBatches, type Arrival, type Schedule, type SchedulePlan } from "./schedule";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const CADENCE = { every: 600, from: 0, until: 3 * 3600 } as const;

const rngOf =
  (seed: string) =>
  (...labels: (string | number)[]) =>
    rngFor(["batches-test", seed, 1, ...labels]);

/** Events every 37 seconds, so they never line up with the ten-minute landings. */
function events(count = 280, step = 37): FeedEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    at: 1 + i * step,
    row: { id: i, grams: 10 + (i % 7), bowl: `bowl-${String(i % 5)}` },
  }));
}

function plan(injections: readonly Injection[] = [], extra: Partial<SchedulePlan> = {}) {
  return {
    cadence: CADENCE,
    feeds: { readings: { events: events(), injections } },
    ...extra,
  } satisfies SchedulePlan;
}

function rowsOf(schedule: Schedule, feed = "readings"): Row[] {
  return schedule.batches.flatMap((batch) => batch.feeds[feed] ?? []);
}

function arrivalsOf(schedule: Schedule, feed = "readings"): Arrival[] {
  return schedule.arrivals.filter((a) => a.feed === feed);
}

/** Index of the first landing at or after a second, the on-time batch with no delay. */
function firstBatchBy(schedule: Schedule, second: number): number {
  return schedule.landings.findIndex((landing) => landing >= second);
}

const sortKey = (row: Row) => JSON.stringify(row);

describe("scheduleBatches", () => {
  it("is the same for the same plan and seed", () => {
    const injections: Injection[] = [
      { kind: "late", share: 0.2, by: { seconds: { min: 60, max: 1200 } } },
      { kind: "duplicate", share: 0.1, after: { batches: { min: 0, max: 2 } } },
      { kind: "outOfOrder", share: 0.5 },
    ];
    expect(scheduleBatches(plan(injections), rngOf("a"))).toEqual(
      scheduleBatches(plan(injections), rngOf("a")),
    );
  });

  it("differs between seeds once something is injected", () => {
    const injections: Injection[] = [
      { kind: "late", share: 0.2, by: { seconds: { min: 60, max: 1200 } } },
    ];
    for (const seed of SEEDS) {
      expect(scheduleBatches(plan(injections), rngOf(seed))).not.toEqual(
        scheduleBatches(plan(injections), rngOf(`${seed}-other`)),
      );
    }
  });

  it("delivers each event once, in the first batch at or after its second, with no injections", () => {
    const schedule = scheduleBatches(plan(), rngOf("a"));
    const sources = events();
    expect(rowsOf(schedule)).toEqual(sources.map((e) => e.row));
    for (const arrival of arrivalsOf(schedule)) {
      const event = sources[arrival.source];
      if (!event) throw new Error("Unknown source.");
      expect(arrival.batch).toBe(firstBatchBy(schedule, event.at));
      expect(arrival).toMatchObject({ copy: "original", late: false, drifted: false });
    }
    expect(schedule.undelivered).toEqual([]);
  });

  it("holds every event back by the feed's delay", () => {
    const schedule = scheduleBatches(
      { cadence: CADENCE, feeds: { readings: { events: events(), delay: 300 } } },
      rngOf("a"),
    );
    const sources = events();
    for (const arrival of arrivalsOf(schedule)) {
      const event = sources[arrival.source];
      if (!event) throw new Error("Unknown source.");
      expect(arrival.batch).toBe(firstBatchBy(schedule, event.at + 300));
    }
  });

  it("numbers batches from 0 and stamps each with the night clock's local time", () => {
    const schedule = scheduleBatches(plan(), rngOf("a"));
    expect(schedule.batches.map((b) => b.index)).toEqual(schedule.landings.map((_, i) => i));
    expect(schedule.landings).toEqual(Array.from({ length: 19 }, (_, i) => i * 600));
    expect(schedule.batches[1]?.arrivesAt).toBe("2026-10-31 18:10:00");
    schedule.batches.forEach((batch, i) => {
      expect(batch.arrivesAt).toBe(clockAt(schedule.landings[i] ?? -1).local);
    });
  });

  it("lands explicit batches across the fall-back with the repeated hour's clock", () => {
    const schedule = scheduleBatches(
      { cadence: { at: [7.5 * 3600, 8.5 * 3600] }, feeds: { readings: { events: [] } } },
      rngOf("a"),
    );
    expect(schedule.batches.map((b) => b.arrivesAt)).toEqual([
      "2026-11-01 01:30:00",
      "2026-11-01 01:30:00",
    ]);
  });

  it("gives every batch every feed, in name order", () => {
    const schedule = scheduleBatches(
      {
        cadence: CADENCE,
        feeds: { zeta: { events: [] }, alpha: { events: events(3) } },
      },
      rngOf("a"),
    );
    for (const batch of schedule.batches)
      expect(Object.keys(batch.feeds)).toEqual(["alpha", "zeta"]);
  });

  it("rejects events sent after the last batch and cadences that go nowhere", () => {
    expect(() =>
      scheduleBatches(
        { cadence: { at: [600] }, feeds: { readings: { events: events(30) } } },
        rngOf("a"),
      ),
    ).toThrow(/after the last batch/);
    expect(() => scheduleBatches({ cadence: { at: [600, 600] }, feeds: {} }, rngOf("a"))).toThrow(
      /strictly increase/,
    );
    expect(() => scheduleBatches({ cadence: { at: [] }, feeds: {} }, rngOf("a"))).toThrow(
      /at least one batch/,
    );
  });

  it("produces batches the puzzle validator accepts", () => {
    const schedule = scheduleBatches(
      plan([{ kind: "duplicate", share: 0.1, after: { batches: { min: 1, max: 1 } } }]),
      rngOf("a"),
    );
    const checkpoints = [
      { id: "early", afterBatch: 3, label: "18:30" },
      { id: "late", afterBatch: schedule.batches.length - 1, label: "21:00" },
    ];
    const totals = { "gold.totals": [] };
    expect(
      validatePuzzleData(fakePuzzle(), {
        batches: schedule.batches,
        checkpoints,
        expected: { early: totals, late: totals },
        narrative: {},
      }),
    ).toEqual([]);
  });

  it("schedules a real world feed", () => {
    const seed = "raven-pumpkin-13";
    const { readings } = generatePumpkinSensors(seed, generateHouses(seed));
    const feed = readings.map((r) => ({
      at: r.secondsIntoNight,
      row: { reading_id: r.readingId, flame_lux: r.flameLux },
    }));
    const schedule = scheduleBatches(
      {
        cadence: { every: 900, from: 900, until: 36_000 },
        feeds: { pumpkin_readings: { events: feed } },
      },
      rngOf(seed),
    );
    expect(rowsOf(schedule, "pumpkin_readings")).toHaveLength(feed.length);
  });
});

describe("late injection", () => {
  const maxLate = 1200;
  const late: Injection = {
    kind: "late",
    share: 0.25,
    by: { seconds: { min: 300, max: maxLate } },
  };

  it("moves exactly the chosen share, never earlier and never past the lateness bound", () => {
    const sources = events();
    for (const seed of SEEDS) {
      const schedule = scheduleBatches(plan([late]), rngOf(seed));
      const arrivals = arrivalsOf(schedule);
      // Rows slipping past the last batch never arrive, and the schedule says so.
      expect(arrivals.length + schedule.undelivered.length).toBe(sources.length);
      let moved = schedule.undelivered.length;
      for (const arrival of arrivals) {
        const event = sources[arrival.source];
        if (!event) throw new Error("Unknown source.");
        const onTime = firstBatchBy(schedule, event.at);
        if (arrival.batch !== onTime) moved++;
        expect(arrival.late).toBe(arrival.batch > onTime);
        expect(arrival.batch).toBeGreaterThanOrEqual(onTime);
        // The batch before the one it made must have landed before the slipped send.
        const before = schedule.landings[arrival.batch - 1];
        if (arrival.late && before !== undefined) expect(before).toBeLessThan(event.at + maxLate);
      }
      // A 300 to 1200 second slip against 600 second batches moves most, not all, chosen rows.
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThanOrEqual(Math.round(0.25 * sources.length));
    }
  });

  it("touches only rows its filter admits", () => {
    const schedule = scheduleBatches(
      plan([{ ...late, share: 1, where: (row) => row.bowl === "bowl-2" }]),
      rngOf("a"),
    );
    for (const arrival of arrivalsOf(schedule)) {
      if (arrival.late) expect(events()[arrival.source]?.row.bowl).toBe("bowl-2");
    }
    expect(arrivalsOf(schedule).some((a) => a.late)).toBe(true);
  });

  it("skips whole batches when slipped by batch count", () => {
    const schedule = scheduleBatches(
      plan([{ kind: "late", share: 1, by: { batches: { min: 2, max: 2 } } }]),
      rngOf("a"),
    );
    const sources = events();
    for (const arrival of arrivalsOf(schedule)) {
      const event = sources[arrival.source];
      if (!event) throw new Error("Unknown source.");
      expect(arrival.batch).toBe(firstBatchBy(schedule, event.at) + 2);
    }
  });

  it("drops rows pushed past the last batch into the undelivered list", () => {
    const schedule = scheduleBatches(
      plan([{ kind: "late", share: 1, by: { batches: { min: 3, max: 3 } } }]),
      rngOf("a"),
    );
    const lastBatch = schedule.batches.length - 1;
    const sources = events();
    const expectedLost = sources.flatMap((e, source) =>
      firstBatchBy(schedule, e.at) + 3 > lastBatch ? [source] : [],
    );
    expect(expectedLost.length).toBeGreaterThan(0);
    expect(schedule.undelivered.map((u) => u.source)).toEqual(expectedLost);
    expect(arrivalsOf(schedule)).toHaveLength(sources.length - expectedLost.length);
  });
});

describe("duplicate injection", () => {
  it("delivers exact copies of the chosen share and marks them", () => {
    const sources = events();
    const schedule = scheduleBatches(plan([{ kind: "duplicate", share: 0.1 }]), rngOf("a"));
    const arrivals = arrivalsOf(schedule);
    const copies = arrivals.filter((a) => a.copy === "duplicate");
    expect(copies).toHaveLength(Math.round(0.1 * sources.length));
    for (const copy of copies) {
      const original = arrivals.find((a) => a.source === copy.source && a.copy === "original");
      if (!original) throw new Error("A copy has no original.");
      // With no `after`, the copy follows its original in the same batch.
      expect(copy.batch).toBe(original.batch);
      expect(copy.position).toBeGreaterThan(original.position);
      const rows = schedule.batches[copy.batch]?.feeds.readings;
      expect(rows?.[copy.position]).toEqual(rows?.[original.position]);
      expect(rows?.[copy.position]).toEqual(sources[copy.source]?.row);
    }
  });

  it("resends in a later batch when asked", () => {
    const schedule = scheduleBatches(
      plan([{ kind: "duplicate", share: 0.2, after: { batches: { min: 1, max: 3 } } }]),
      rngOf("a"),
    );
    const arrivals = arrivalsOf(schedule);
    for (const copy of arrivals.filter((a) => a.copy === "duplicate")) {
      const original = arrivals.find((a) => a.source === copy.source && a.copy === "original");
      expect(copy.batch - (original?.batch ?? 0)).toBeGreaterThanOrEqual(1);
      expect(copy.batch - (original?.batch ?? 0)).toBeLessThanOrEqual(3);
    }
  });
});

describe("outOfOrder injection", () => {
  it("keeps each batch's rows and only reorders them", () => {
    const shuffled = scheduleBatches(plan([{ kind: "outOfOrder", share: 0.6 }]), rngOf("a"));
    const clean = scheduleBatches(plan(), rngOf("a"));
    const multiset = (batch: Batch | undefined) =>
      (batch?.feeds.readings ?? []).map(sortKey).sort();
    clean.batches.forEach((batch, i) => {
      expect(multiset(shuffled.batches[i])).toEqual(multiset(batch));
    });
    expect(rowsOf(shuffled)).not.toEqual(rowsOf(clean));
  });
});

describe("schemaDrift injection", () => {
  const driftFrom = 7;
  function drifted(changes: Extract<Injection, { kind: "schemaDrift" }>["changes"]) {
    const schedule = scheduleBatches(
      plan([{ kind: "schemaDrift", from: { batch: driftFrom }, changes }]),
      rngOf("a"),
    );
    const clean = scheduleBatches(plan(), rngOf("a"));
    return { schedule, clean };
  }

  it("changes only rows from the drift batch onward", () => {
    const { schedule, clean } = drifted([{ kind: "drop", column: "bowl" }]);
    schedule.batches.forEach((batch, i) => {
      const rows = batch.feeds.readings ?? [];
      if (i < driftFrom) expect(rows).toEqual(clean.batches[i]?.feeds.readings);
      else for (const row of rows) expect(Object.keys(row)).toEqual(["id", "grams"]);
    });
    for (const arrival of arrivalsOf(schedule))
      expect(arrival.drifted).toBe(arrival.batch >= driftFrom);
  });

  it("starts at the first batch landing at or after a second", () => {
    const schedule = scheduleBatches(
      plan([
        {
          kind: "schemaDrift",
          from: { second: 3001 },
          changes: [{ kind: "drop", column: "bowl" }],
        },
      ]),
      rngOf("a"),
    );
    expect(arrivalsOf(schedule).find((a) => a.drifted)?.batch).toBe(6);
  });

  it.each([
    [
      { kind: "rename", column: "grams", to: "weight_g" },
      { id: 0, weight_g: 10, bowl: "bowl-0" },
    ],
    [
      { kind: "stringify", column: "grams", unit: "g" },
      { id: 0, grams: "10 g", bowl: "bowl-0" },
    ],
    [
      { kind: "stringify", column: "grams" },
      { id: 0, grams: "10", bowl: "bowl-0" },
    ],
    [
      { kind: "add", column: "vendor", value: "acme" },
      { id: 0, grams: 10, bowl: "bowl-0", vendor: "acme" },
    ],
    [
      { kind: "drop", column: "grams" },
      { id: 0, bowl: "bowl-0" },
    ],
    [
      { kind: "custom", transform: (row: Row) => ({ ...row, grams: null }) },
      { id: 0, grams: null, bowl: "bowl-0" },
    ],
  ] as const)("applies %o", (change, expected) => {
    const schedule = scheduleBatches(
      {
        cadence: CADENCE,
        feeds: {
          readings: {
            events: [{ at: 0, row: { id: 0, grams: 10, bowl: "bowl-0" } }],
            injections: [{ kind: "schemaDrift", from: { batch: 0 }, changes: [change] }],
          },
        },
      },
      rngOf("a"),
    );
    const row = schedule.batches[0]?.feeds.readings?.[0];
    expect(row).toEqual(expected);
    expect(Object.keys(row ?? {})).toEqual(Object.keys(expected));
  });

  it("leaves nulls null when stringifying", () => {
    const schedule = scheduleBatches(
      {
        cadence: CADENCE,
        feeds: {
          readings: {
            events: [{ at: 0, row: { grams: null } }],
            injections: [
              {
                kind: "schemaDrift",
                from: { batch: 0 },
                changes: [{ kind: "stringify", column: "grams", unit: "g" }],
              },
            ],
          },
        },
      },
      rngOf("a"),
    );
    expect(schedule.batches[0]?.feeds.readings).toEqual([{ grams: null }]);
  });
});

describe("injection composition", () => {
  const late: Injection = { kind: "late", share: 0.3, by: { batches: { min: 1, max: 4 } } };
  const duplicate: Injection = {
    kind: "duplicate",
    share: 0.3,
    after: { batches: { min: 0, max: 1 } },
  };
  const shuffle: Injection = { kind: "outOfOrder", share: 0.5 };
  const drift: Injection = {
    kind: "schemaDrift",
    from: { batch: 8 },
    changes: [{ kind: "stringify", column: "grams", unit: "g" }],
  };

  it("applies late, duplicate, outOfOrder, then schemaDrift whatever the listed order", () => {
    const listed = scheduleBatches(plan([late, duplicate, shuffle, drift]), rngOf("a"));
    // Streams are keyed by kind, so callers can list injections in any order.
    const reversed = scheduleBatches(plan([drift, shuffle, duplicate, late]), rngOf("a"));
    expect(reversed).toEqual(listed);
  });

  it("copies late rows no earlier than the late original, and drifts by final batch", () => {
    for (const seed of SEEDS) {
      const schedule = scheduleBatches(plan([duplicate, late, drift]), rngOf(seed));
      const arrivals = arrivalsOf(schedule);
      for (const copy of arrivals.filter((a) => a.copy === "duplicate")) {
        const original = arrivals.find((a) => a.source === copy.source && a.copy === "original");
        if (!original) continue;
        expect(copy.batch).toBeGreaterThanOrEqual(original.batch);
      }
      for (const arrival of arrivals) {
        const row = schedule.batches[arrival.batch]?.feeds.readings?.[arrival.position];
        expect(typeof row?.grams).toBe(arrival.batch >= 8 ? "string" : "number");
      }
    }
  });
});
