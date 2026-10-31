import "server-only";
import type { Batch, Row } from "../puzzle";
import type { Rng } from "../random";
import { clockAt, NIGHT_SECONDS } from "../world/night-clock";
import { batchLandingBy, landingSeconds, type Cadence } from "./cadence";
import { applyDriftChange } from "./drift";
import {
  INJECTION_ORDER,
  injectDuplicates,
  injectLate,
  injectOutOfOrder,
  type Delivery,
  type FeedEvent,
  type Injection,
  type InjectionContext,
} from "./injections";

/** How one feed's true events become deliveries. */
export interface FeedPlan {
  readonly events: readonly FeedEvent[];
  /** Seconds between an event and its sending, before any injection. Defaults to 0. */
  readonly delay?: number;
  readonly injections?: readonly Injection[];
}

/** A puzzle's whole delivery plan: when batches land, and how each feed behaves. */
export interface SchedulePlan {
  readonly cadence: Cadence;
  readonly feeds: Readonly<Record<string, FeedPlan>>;
}

/** Where one delivered row ended up, so expected answers can see exactly what had arrived. */
export interface Arrival {
  readonly feed: string;
  /** Index of the true event in the feed's event list. */
  readonly source: number;
  readonly batch: number;
  /** Index of the row in that batch's rows for the feed. */
  readonly position: number;
  readonly copy: "original" | "duplicate";
  /** Arrived in a later batch than it would have with nothing injected. */
  readonly late: boolean;
  /** The row is in the drifted shape rather than the clean one. */
  readonly drifted: boolean;
}

/** A delivery a slip pushed past the night's last batch: it never arrives. */
export interface Undelivered {
  readonly feed: string;
  readonly source: number;
  readonly copy: "original" | "duplicate";
}

export interface Schedule {
  readonly batches: readonly Batch[];
  /** The night second each batch lands, by batch index. */
  readonly landings: readonly number[];
  /** Every delivered row, by batch, then feed name, then position. */
  readonly arrivals: readonly Arrival[];
  readonly undelivered: readonly Undelivered[];
}

/**
 * A random stream for a set of labels, such as `GenerateContext.rng`. The scheduler asks for
 * one stream per feed and injection, so adding an injection never reshuffles another.
 */
export type ScheduleRng = (...labels: (string | number)[]) => Rng;

function onTimeDeliveries(feed: string, plan: FeedPlan, landings: readonly number[]): Delivery[] {
  const delay = plan.delay ?? 0;
  if (!Number.isInteger(delay) || delay < 0) {
    throw new RangeError(`Feed ${feed} needs a whole, non-negative delay, not ${String(delay)}.`);
  }
  return plan.events.map(({ at }, source) => {
    if (!Number.isInteger(at) || at < 0 || at > NIGHT_SECONDS) {
      throw new RangeError(`Feed ${feed} event ${String(source)} is not at a second of the night.`);
    }
    const sentAt = at + delay;
    const batch = batchLandingBy(landings, sentAt);
    if (batch === undefined) {
      throw new RangeError(
        `Feed ${feed} event ${String(source)} is sent after the last batch lands.`,
      );
    }
    return { id: source, source, copy: "original", onTimeBatch: batch, batch, sentAt, tie: source };
  });
}

/** The first batch index a drift applies from, or undefined when it starts after the night. */
function driftStart(
  from: Extract<Injection, { kind: "schemaDrift" }>["from"],
  landings: readonly number[],
): number | undefined {
  if ("second" in from) return batchLandingBy(landings, from.second);
  if (!Number.isInteger(from.batch) || from.batch < 0) {
    throw new RangeError(`A drift must start at a batch index, not ${String(from.batch)}.`);
  }
  return from.batch;
}

function scheduleFeed(feed: string, plan: FeedPlan, landings: readonly number[], rng: ScheduleRng) {
  // Injections keep their listed position as their stream label, so reordering the phases
  // never changes which draws an injection gets.
  const injections = (plan.injections ?? [])
    .map((injection, listed) => ({ injection, listed }))
    .sort(
      (a, b) =>
        INJECTION_ORDER.indexOf(a.injection.kind) - INJECTION_ORDER.indexOf(b.injection.kind) ||
        a.listed - b.listed,
    );

  let deliveries = onTimeDeliveries(feed, plan, landings);
  const drifts: { start: number; injection: Extract<Injection, { kind: "schemaDrift" }> }[] = [];
  for (const { injection, listed } of injections) {
    const context: InjectionContext = {
      events: plan.events,
      landings,
      rng: rng(feed, listed, injection.kind),
    };
    switch (injection.kind) {
      case "late":
        deliveries = injectLate(context, injection, deliveries);
        break;
      case "duplicate":
        deliveries = injectDuplicates(context, injection, deliveries);
        break;
      case "outOfOrder":
        deliveries = injectOutOfOrder(context, injection, deliveries);
        break;
      case "schemaDrift": {
        const start = driftStart(injection.from, landings);
        if (start !== undefined) drifts.push({ start, injection });
        break;
      }
    }
  }

  const rowFor = (delivery: Delivery & { batch: number }): { row: Row; drifted: boolean } => {
    const event = plan.events[delivery.source];
    if (!event) throw new Error(`Feed ${feed} lost event ${String(delivery.source)}.`);
    let row = event.row;
    let drifted = false;
    for (const { start, injection } of drifts) {
      if (delivery.batch < start) continue;
      drifted = true;
      for (const change of injection.changes) row = applyDriftChange(row, change);
    }
    return { row, drifted };
  };

  const delivered = deliveries
    .filter((d): d is Delivery & { batch: number } => d.batch !== undefined)
    .sort((a, b) => a.batch - b.batch || a.sentAt - b.sentAt || a.tie - b.tie || a.id - b.id);
  const undelivered = deliveries
    .filter((d) => d.batch === undefined)
    .sort((a, b) => a.id - b.id)
    .map(({ source, copy }): Undelivered => ({ feed, source, copy }));
  return { delivered: delivered.map((d) => ({ delivery: d, ...rowFor(d) })), undelivered };
}

/**
 * Turns each feed's true events into batches in arrival order. With no injections, an event
 * arrives once, in the first batch landing at or after its second plus the feed's delay, and
 * rows within a batch follow the order they were sent. Every random draw comes from `rng`,
 * keyed by feed and injection, so the same plan and streams always give the same night.
 */
export function scheduleBatches(plan: SchedulePlan, rng: ScheduleRng): Schedule {
  const landings = landingSeconds(plan.cadence);
  // Feed names are sorted so neither batches nor the manifest depend on how the plan was built.
  const feeds = Object.keys(plan.feeds).sort();
  const rows = landings.map(() => new Map<string, Row[]>(feeds.map((feed) => [feed, []])));
  const arrivals: Arrival[] = [];
  const undelivered: Undelivered[] = [];

  for (const feed of feeds) {
    const feedPlan = plan.feeds[feed];
    if (!feedPlan) continue;
    const scheduled = scheduleFeed(feed, feedPlan, landings, rng);
    undelivered.push(...scheduled.undelivered);
    for (const { delivery, row, drifted } of scheduled.delivered) {
      const batchRows = rows[delivery.batch]?.get(feed);
      if (!batchRows) throw new Error(`Batch ${String(delivery.batch)} does not exist.`);
      arrivals.push({
        feed,
        source: delivery.source,
        batch: delivery.batch,
        position: batchRows.length,
        copy: delivery.copy,
        late: delivery.batch > delivery.onTimeBatch,
        drifted,
      });
      batchRows.push(row);
    }
  }

  arrivals.sort(
    (a, b) =>
      a.batch - b.batch ||
      (a.feed < b.feed ? -1 : a.feed > b.feed ? 1 : 0) ||
      a.position - b.position,
  );
  const batches = landings.map((landing, index): Batch => ({
    index,
    arrivesAt: clockAt(landing).local,
    feeds: Object.fromEntries(feeds.map((feed) => [feed, rows[index]?.get(feed) ?? []])),
  }));
  return { batches, landings, arrivals, undelivered };
}
