import "server-only";
import type { SchedulePlan } from "../../batches/schedule";
import type { FeedEvent } from "../../batches/injections";
import { CURSE_BELL } from "../../world/candy-bowls";
import type { Night } from "../../world/night";

const MINUTE = 60;

/*
 * The hour opens at 6:45pm with everything since dusk already landed, then the scales and
 * scanners upload every five minutes until 7:15pm, when the Mayor reads the result aloud. The
 * bell at 7:00pm is a landing of its own, so its checkpoint sees exactly what arrived by then.
 */
export const CADENCE = { every: 5 * MINUTE, from: 45 * MINUTE, until: 75 * MINUTE } as const;
export const BATCH_COUNT = (CADENCE.until - CADENCE.from) / CADENCE.every + 1;
export const BELL_BATCH = (CURSE_BELL - CADENCE.from) / CADENCE.every;
export const LAST_BATCH = BATCH_COUNT - 1;

/** Pairs each true record with its feed row, keeping only what is sent by the last landing. */
function eventsOf(
  records: readonly { readonly nightSecond: number }[],
  rows: Night["feeds"][keyof Night["feeds"]],
): FeedEvent[] {
  if (records.length !== rows.length) throw new Error("A feed lost track of its records.");
  return records.flatMap((record, i) => {
    const row = rows[i];
    return row && record.nightSecond <= CADENCE.until ? [{ at: record.nightSecond, row }] : [];
  });
}

/** Reference data published once, before the first upload: the directory, stock, and catalog. */
function upFront(rows: Night["feeds"][keyof Night["feeds"]]): FeedEvent[] {
  return rows.map((row) => ({ at: 0, row }));
}

/**
 * How the hour's five feeds arrive. Scale readings come in the order the uploads happened to
 * pack them, not by sequence; nothing is late or resent, so the bell's checkpoint holds every
 * reading taken before the bell.
 */
export function deliveryPlan(night: Night): SchedulePlan {
  return {
    cadence: CADENCE,
    feeds: {
      candy_bowls: {
        events: eventsOf(night.candyBowls.readings, night.feeds.candy_bowls),
        injections: [{ kind: "outOfOrder", share: 0.3 }],
      },
      door_scans: { events: eventsOf(night.doorScans, night.feeds.door_scans) },
      houses: { events: upFront(night.feeds.houses) },
      bowl_stock: { events: upFront(night.feeds.bowl_stock) },
      candy_catalog: { events: upFront(night.feeds.candy_catalog) },
    },
  };
}
