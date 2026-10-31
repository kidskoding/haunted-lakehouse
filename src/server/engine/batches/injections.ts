import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import { batchLandingBy } from "./cadence";
import type { DriftChange } from "./drift";

/** A whole-number range, both ends included. */
export interface Span {
  readonly min: number;
  readonly max: number;
}

/**
 * How far a row slips. `seconds` is delay added to when it would have been sent, so "up to
 * 20 minutes late" is `{ seconds: { min: 1, max: 1200 } }` and the row lands in the first batch
 * after that; `batches` skips a whole number of landings instead.
 */
export type Slip = { readonly seconds: Span } | { readonly batches: Span };

/** Which rows an injection touches: an exact share of the eligible rows, drawn by the seed. */
export interface Selection {
  /** From 0 to 1. The count is rounded to the nearest row, so the share is exact, not a chance. */
  readonly share: number;
  /** Narrows the eligible rows by the clean row and its true night second. Must be pure. */
  readonly where?: (row: Row, at: number) => boolean;
}

/**
 * One way a feed misbehaves. A feed's injections always apply in this order, whatever order
 * they are listed in: late, then duplicate, then outOfOrder, then schemaDrift. Each kind acts
 * on what the kinds before it left, so a resend of a late row is late too, shuffles mix in the
 * copies, and drift follows the batch a row finally lands in. Same-kind injections apply in
 * listed order.
 */
export type Injection =
  | (Selection & { readonly kind: "late"; readonly by: Slip })
  /**
   * Exact copies; `after` defaults to the same batch as the row it copies. A copy landing past
   * a drift arrives in the new shape, as a real resend would.
   */
  | (Selection & { readonly kind: "duplicate"; readonly after?: Slip })
  /** Shuffles the chosen rows among their own positions, never across batches. */
  | (Selection & { readonly kind: "outOfOrder" })
  | {
      readonly kind: "schemaDrift";
      /** The first batch in the new shape, by index or as the first landing at or after a second. */
      readonly from: { readonly batch: number } | { readonly second: number };
      /** Applied in order to every row from that batch onward. */
      readonly changes: readonly DriftChange[];
    };

export const INJECTION_ORDER = ["late", "duplicate", "outOfOrder", "schemaDrift"] as const;

/** A true event as the feed would have sent it, before anything goes wrong. */
export interface FeedEvent {
  /** True night second the event happened. */
  readonly at: number;
  readonly row: Row;
}

/** One planned delivery of an event. Injections replace deliveries rather than mutate them. */
export interface Delivery {
  /** Unique per feed, in creation order: the final tiebreak, so ordering never depends on luck. */
  readonly id: number;
  /** Index of the event in the feed's event list. */
  readonly source: number;
  readonly copy: "original" | "duplicate";
  /** The batch the event would have arrived in with nothing injected. */
  readonly onTimeBatch: number;
  /** Undefined once a slip pushes the delivery past the night's last batch. */
  readonly batch: number | undefined;
  /** Arrival order within a batch is by this second, then by `tie`. */
  readonly sentAt: number;
  readonly tie: number;
}

export interface InjectionContext {
  readonly events: readonly FeedEvent[];
  readonly landings: readonly number[];
  readonly rng: Rng;
}

function drawSpan(rng: Rng, { min, max }: Span): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
    throw new RangeError(
      `A slip needs whole numbers with 0 <= min <= max, got ${String(min)}..${String(max)}.`,
    );
  }
  return rng.int(min, max + 1);
}

/** Where a delivery sent at `sentAt` in batch `batch` lands after slipping, never earlier. */
function slip(
  context: InjectionContext,
  by: Slip,
  batch: number,
  sentAt: number,
): Pick<Delivery, "batch" | "sentAt"> {
  const { landings, rng } = context;
  if ("seconds" in by) {
    // Every delivery is sent no later than its batch lands, so a later send never lands earlier.
    const later = sentAt + drawSpan(rng, by.seconds);
    return { batch: batchLandingBy(landings, later), sentAt: later };
  }
  const target = batch + drawSpan(rng, by.batches);
  if (target === batch) return { batch, sentAt };
  const landing = landings[target];
  // A row skipping whole batches comes in at the end of the one it finally makes.
  return landing === undefined ? { batch: undefined, sentAt } : { batch: target, sentAt: landing };
}

/** `count` distinct positions out of `size`, ascending, by a partial Fisher-Yates shuffle. */
function choose(rng: Rng, size: number, count: number): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = rng.int(i, size);
    const picked = pool[j] ?? j;
    pool[j] = pool[i] ?? i;
    pool[i] = picked;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** The ids of the deliveries a selection picks from those eligible, in delivery order. */
function select(
  context: InjectionContext,
  selection: Selection,
  eligible: readonly Delivery[],
): Set<number> {
  const { share, where } = selection;
  if (!(share >= 0 && share <= 1)) {
    throw new RangeError(`An injection's share must be between 0 and 1, not ${String(share)}.`);
  }
  const candidates = eligible.filter((delivery) => {
    if (delivery.batch === undefined) return false;
    if (!where) return true;
    const event = context.events[delivery.source];
    return event !== undefined && where(event.row, event.at);
  });
  const picked = choose(context.rng, candidates.length, Math.round(share * candidates.length));
  return new Set(picked.flatMap((i) => candidates[i]?.id ?? []));
}

export function injectLate(
  context: InjectionContext,
  injection: Selection & { readonly by: Slip },
  deliveries: readonly Delivery[],
): Delivery[] {
  const chosen = select(context, injection, deliveries);
  return deliveries.map((delivery) => {
    if (!chosen.has(delivery.id) || delivery.batch === undefined) return delivery;
    return { ...delivery, ...slip(context, injection.by, delivery.batch, delivery.sentAt) };
  });
}

export function injectDuplicates(
  context: InjectionContext,
  injection: Selection & { readonly after?: Slip },
  deliveries: readonly Delivery[],
): Delivery[] {
  // Only originals are copied, so the share means "this share of events was sent twice".
  const chosen = select(
    context,
    injection,
    deliveries.filter((d) => d.copy === "original"),
  );
  const after = injection.after ?? { batches: { min: 0, max: 0 } };
  let nextId = deliveries.reduce((max, d) => Math.max(max, d.id), -1) + 1;
  const copies: Delivery[] = [];
  for (const delivery of deliveries) {
    if (!chosen.has(delivery.id) || delivery.batch === undefined) continue;
    const id = nextId++;
    copies.push({
      ...delivery,
      ...slip(context, after, delivery.batch, delivery.sentAt),
      id,
      copy: "duplicate",
      tie: id,
    });
  }
  return [...deliveries, ...copies];
}

export function injectOutOfOrder(
  context: InjectionContext,
  injection: Selection,
  deliveries: readonly Delivery[],
): Delivery[] {
  const chosen = select(context, injection, deliveries);
  const byBatch = new Map<number, Delivery[]>();
  for (const delivery of deliveries) {
    if (!chosen.has(delivery.id) || delivery.batch === undefined) continue;
    const group = byBatch.get(delivery.batch) ?? [];
    group.push(delivery);
    byBatch.set(delivery.batch, group);
  }

  // Each chosen row takes another chosen row's place in its batch: the slots stay, the rows move.
  const reordered = new Map<number, Pick<Delivery, "sentAt" | "tie">>();
  const batches = [...byBatch.keys()].sort((a, b) => a - b);
  for (const batch of batches) {
    const group = byBatch.get(batch) ?? [];
    const places = group.map(({ sentAt, tie }) => ({ sentAt, tie }));
    for (let i = places.length - 1; i > 0; i--) {
      const j = context.rng.int(0, i + 1);
      const a = places[i];
      const b = places[j];
      if (a && b) {
        places[i] = b;
        places[j] = a;
      }
    }
    group.forEach((delivery, i) => {
      const place = places[i];
      if (place) reordered.set(delivery.id, place);
    });
  }
  return deliveries.map((delivery) => {
    const place = reordered.get(delivery.id);
    return place ? { ...delivery, ...place } : delivery;
  });
}
