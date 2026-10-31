import { describe, expect, it } from "vitest";
import type { Injection } from "../batches/injections";
import { scheduleBatches } from "../batches/schedule";
import type { PuzzleData, Row } from "../puzzle";
import { rngFor } from "../random";
import { RelicError } from "./errors";
import { feedNames, schemaHistory } from "./lantern";

/** A night of one `readings` feed, one batch per entry, with no checkpoints worth checking. */
function nightOf(batches: readonly (readonly Row[])[]): PuzzleData {
  return {
    batches: batches.map((rows, index) => ({
      index,
      arrivesAt: `18:${String(index).padStart(2, "0")}`,
      feeds: { readings: rows, other: [] },
    })),
    checkpoints: [{ id: "end", afterBatch: batches.length - 1, label: "end" }],
    expected: { end: {} },
    narrative: {},
  };
}

function scheduledNight(seed: string): PuzzleData {
  const injections: Injection[] = [
    { kind: "late", share: 0.2, by: { seconds: { min: 60, max: 1500 } } },
    { kind: "duplicate", share: 0.1, after: { batches: { min: 0, max: 3 } } },
    {
      kind: "schemaDrift",
      from: { batch: 5 },
      changes: [
        { kind: "rename", column: "grams", to: "weight_g" },
        { kind: "stringify", column: "weight_g", unit: "g" },
      ],
    },
    {
      kind: "schemaDrift",
      from: { batch: 12 },
      changes: [
        { kind: "drop", column: "bowl" },
        { kind: "add", column: "scanner", value: "v2" },
      ],
    },
  ];
  const schedule = scheduleBatches(
    {
      cadence: { every: 600, from: 0, until: 3 * 3600 },
      feeds: {
        readings: {
          events: Array.from({ length: 280 }, (_, i) => ({
            at: 1 + i * 37,
            row: { id: i, grams: 10 + (i % 7), bowl: `bowl-${String(i % 5)}` },
          })),
          injections,
        },
      },
    },
    (...labels) => rngFor(["lantern-test", seed, 1, ...labels]),
  );
  return {
    batches: schedule.batches,
    checkpoints: [{ id: "end", afterBatch: schedule.batches.length - 1, label: "3:00am" }],
    expected: { end: {} },
    narrative: {},
  };
}

describe("schemaHistory", () => {
  it("shows each shape a drifting scheduled feed takes, and when it lands", () => {
    const data = scheduledNight("raven-pumpkin-13");
    const first = data.batches.findIndex((batch) => (batch.feeds.readings ?? []).length > 0);
    expect(schemaHistory(data, "readings")).toEqual({
      feed: "readings",
      versions: [
        {
          fromBatch: first,
          arrivesAt: data.batches[first]?.arrivesAt,
          columns: [
            { name: "id", type: "number" },
            { name: "grams", type: "number" },
            { name: "bowl", type: "text" },
          ],
          changes: [],
        },
        {
          fromBatch: 5,
          arrivesAt: data.batches[5]?.arrivesAt,
          columns: [
            { name: "id", type: "number" },
            { name: "weight_g", type: "text" },
            { name: "bowl", type: "text" },
          ],
          changes: [
            { kind: "dropped", column: "grams" },
            { kind: "added", column: "weight_g", type: "text" },
          ],
        },
        {
          fromBatch: 12,
          arrivesAt: data.batches[12]?.arrivesAt,
          columns: [
            { name: "id", type: "number" },
            { name: "weight_g", type: "text" },
            { name: "scanner", type: "text" },
          ],
          changes: [
            { kind: "dropped", column: "bowl" },
            { kind: "added", column: "scanner", type: "text" },
          ],
        },
      ],
    });
  });

  it("is the same for every seed's night, since drift follows the plan, not the luck", () => {
    const history = schemaHistory(scheduledNight("seed-0"), "readings");
    for (let i = 1; i < 20; i++) {
      expect(schemaHistory(scheduledNight(`seed-${String(i)}`), "readings")).toEqual(history);
    }
  });

  it("reports a column that changes type in place", () => {
    const history = schemaHistory(
      nightOf([[{ id: 1, grams: 12 }], [{ id: 2, grams: "12 g" }]]),
      "readings",
    );
    expect(history.versions.map((v) => v.changes)).toEqual([
      [],
      [{ kind: "retyped", column: "grams", from: "number", to: "text" }],
    ]);
  });

  it("keeps a retyped column's new type for the rest of the night", () => {
    const history = schemaHistory(
      nightOf([
        ...[0, 1, 2].map((id) => [{ id, grams: 12 }]),
        ...[3, 4, 5, 6].map((id) => [{ id, grams: "12 g" }]),
      ]),
      "readings",
    );
    expect(history.versions).toEqual([
      {
        fromBatch: 0,
        arrivesAt: "18:00",
        columns: [
          { name: "id", type: "number" },
          { name: "grams", type: "number" },
        ],
        changes: [],
      },
      {
        fromBatch: 3,
        arrivesAt: "18:03",
        columns: [
          { name: "id", type: "number" },
          { name: "grams", type: "text" },
        ],
        changes: [{ kind: "retyped", column: "grams", from: "number", to: "text" }],
      },
    ]);
  });

  it("treats nulls as fitting any type, and settles a type once a value shows it", () => {
    const history = schemaHistory(
      nightOf([
        [{ id: 1, note: null }],
        [{ id: 2, note: "late" }],
        [{ id: 3, note: null, flagged: null }],
        [{ id: 4, note: null, flagged: true }],
      ]),
      "readings",
    );
    expect(history.versions).toEqual([
      {
        fromBatch: 0,
        arrivesAt: "18:00",
        columns: [
          { name: "id", type: "number" },
          { name: "note", type: "text" },
        ],
        changes: [],
      },
      {
        fromBatch: 2,
        arrivesAt: "18:02",
        columns: [
          { name: "id", type: "number" },
          { name: "note", type: "text" },
          { name: "flagged", type: "boolean" },
        ],
        changes: [{ kind: "added", column: "flagged", type: "boolean" }],
      },
    ]);
  });

  it("marks a column whose values disagree within one batch as mixed", () => {
    const history = schemaHistory(nightOf([[{ grams: 12 }, { grams: "12 g" }]]), "readings");
    expect(history.versions[0]?.columns).toEqual([{ name: "grams", type: "mixed" }]);
  });

  it("skips batches that deliver nothing to the feed", () => {
    const history = schemaHistory(nightOf([[], [{ id: 1 }], [], [{ id: 2 }]]), "readings");
    expect(history.versions.map((v) => v.fromBatch)).toEqual([1]);
    expect(schemaHistory(nightOf([[{ id: 1 }]]), "other").versions).toEqual([]);
  });

  it("refuses a feed that never arrives", () => {
    const data = nightOf([[{ id: 1 }]]);
    expect(feedNames(data)).toEqual(["other", "readings"]);
    expect(() => schemaHistory(data, "gold.totals")).toThrow(
      expect.objectContaining({ code: "unknown-feed" }) as RelicError,
    );
  });
});
