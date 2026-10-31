import "server-only";
import type { Row } from "../puzzle";
import { byText } from "./device-ids";
import { clockAt, type UtcOffset } from "./night-clock";

export type LedgerOp = "insert" | "update" | "delete";

/**
 * One change to one kid's balance of one candy, as the Co-op ledger logged it. The ledger is
 * a change feed of balances, not of amounts: each change carries the balance after it, so
 * the order changes are applied in decides the result. That is the point of the hour.
 */
export interface LedgerChange {
  /** Log sequence number: 1, 2, 3, ... across the whole ledger, in the order changes happened. */
  readonly lsn: number;
  readonly op: LedgerOp;
  readonly kidId: string;
  readonly candyType: string;
  /** The balance after the change; null on a delete, when the balance fell to zero. */
  readonly pieces: number | null;
  /** True time, in seconds since 18:00 CDT. Never shipped. */
  readonly nightSecond: number;
  readonly changedAtLocal: string;
  readonly utcOffset: UtcOffset;
  /** The trade behind the change, or null for candy collected at a door. */
  readonly tradeId: string | null;
}

/**
 * One version of one kid's balance of one candy, SCD Type 2 style: it held from `validFrom`
 * up to, not including, `validTo`. A version that ends in a delete is followed by a gap until
 * the kid holds that candy again.
 */
export interface HoldingVersion {
  readonly kidId: string;
  readonly candyType: string;
  readonly pieces: number;
  readonly validFrom: number;
  /** When the next change to this balance happened, or null if it was still current at 03:00. */
  readonly validTo: number | null;
  /** The ledger change that opened this version. */
  readonly lsn: number;
}

export interface Holding {
  readonly kidId: string;
  readonly candyType: string;
  readonly pieces: number;
}

/** A running ledger. Changes must be applied in true-time order. */
export interface LedgerBook {
  /** The candy a kid holds right now, by candy type, with only positive balances. */
  readonly holdingsOf: (kidId: string) => readonly (readonly [string, number])[];
  /** Adds `delta` pieces to a balance, logging the change. A balance never goes negative. */
  readonly apply: (
    kidId: string,
    candyType: string,
    delta: number,
    nightSecond: number,
    tradeId: string | null,
  ) => void;
  readonly changes: () => readonly LedgerChange[];
  /** Every version, by kid, then candy type, then time. */
  readonly history: () => readonly HoldingVersion[];
}

interface OpenVersion {
  kidId: string;
  candyType: string;
  pieces: number;
  validFrom: number;
  validTo: number | null;
  lsn: number;
}

export function openLedger(): LedgerBook {
  const balances = new Map<string, Map<string, number>>();
  const changes: LedgerChange[] = [];
  const versions: OpenVersion[] = [];
  const current = new Map<string, OpenVersion>();

  return {
    holdingsOf(kidId) {
      const held = [...(balances.get(kidId) ?? new Map<string, number>())];
      return held.filter(([, pieces]) => pieces > 0).sort(([a], [b]) => byText(a, b));
    },
    apply(kidId, candyType, delta, nightSecond, tradeId) {
      const kid = balances.get(kidId) ?? new Map<string, number>();
      balances.set(kidId, kid);
      const before = kid.get(candyType) ?? 0;
      const after = before + delta;
      if (!Number.isInteger(delta) || delta === 0 || after < 0) {
        throw new RangeError(`${kidId} can't change ${candyType} by ${String(delta)}.`);
      }
      const previous = changes.at(-1);
      if (previous && previous.nightSecond > nightSecond) {
        throw new RangeError("Ledger changes must be applied in true-time order.");
      }
      kid.set(candyType, after);

      const lsn = changes.length + 1;
      let op: LedgerOp = "update";
      if (before === 0) op = "insert";
      else if (after === 0) op = "delete";
      const clock = clockAt(nightSecond);
      changes.push({
        lsn,
        op,
        kidId,
        candyType,
        pieces: after === 0 ? null : after,
        nightSecond,
        changedAtLocal: clock.local,
        utcOffset: clock.utcOffset,
        tradeId,
      });

      const key = `${kidId}\u0000${candyType}`;
      const open = current.get(key);
      if (open) open.validTo = nightSecond;
      current.delete(key);
      if (after > 0) {
        const version = {
          kidId,
          candyType,
          pieces: after,
          validFrom: nightSecond,
          validTo: null,
          lsn,
        };
        versions.push(version);
        current.set(key, version);
      }
    },
    changes: () => [...changes],
    history: () =>
      versions
        .map((v) => ({ ...v }))
        .sort(
          (a, b) =>
            byText(a.kidId, b.kidId) ||
            byText(a.candyType, b.candyType) ||
            a.validFrom - b.validFrom,
        ),
  };
}

/**
 * What every kid held at a night second, counting changes made at that very second, by kid
 * then candy type.
 */
export function holdingsAt(history: readonly HoldingVersion[], second: number): Holding[] {
  return history
    .filter((v) => v.validFrom <= second && (v.validTo === null || second < v.validTo))
    .map(({ kidId, candyType, pieces }) => ({ kidId, candyType, pieces }))
    .sort((a, b) => byText(a.kidId, b.kidId) || byText(a.candyType, b.candyType));
}

/** The `candy_ledger` feed: the Co-op's change log, without the true time behind it. */
export function candyLedgerRows(changes: readonly LedgerChange[]): Row[] {
  return changes.map((c) => ({
    lsn: c.lsn,
    op: c.op,
    kid_id: c.kidId,
    candy_type: c.candyType,
    pieces: c.pieces,
    changed_at_local: c.changedAtLocal,
    utc_offset: c.utcOffset,
    trade_id: c.tradeId,
  }));
}
