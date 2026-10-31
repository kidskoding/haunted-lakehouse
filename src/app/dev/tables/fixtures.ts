import { BronzeFeed } from "@/lib/executor/bronze";
import type { RawRow } from "@/lib/executor/types";

/** The fixture hour keeps the last three batches, like a short-memory message queue. */
export const RETENTION = 3;

const HOUSES = ["Maple", "Willow", "Oak", "Birch", "Hemlock", "Alder"] as const;

function porchBatch(batch: number): RawRow[] {
  return HOUSES.map((house, index) => ({
    house,
    state: (batch + index) % 3 === 0 ? "off" : "on",
    at: `2026-10-31T${String(18 + Math.floor(batch / 2)).padStart(2, "0")}:${batch % 2 === 0 ? "00" : "30"}:00Z`,
  }));
}

function bowlBatch(batch: number): RawRow[] {
  return HOUSES.slice(0, 4).map((house, index) => ({
    house,
    // From batch 4 the scale reports fractions, widening grams from BIGINT to DOUBLE.
    grams: batch >= 4 ? 1200 - batch * 85.5 - index * 10 : 1200 - batch * 80 - index * 10,
    // A column that first lands in batch 3.
    ...(batch >= 3 ? { refilled: index === batch % 4 } : {}),
  }));
}

/** Six batches delivered, so three are retired; one feed drifts its schema mid-night. */
export const DELIVERED = 6;

/**
 * Statements that build the fixture night in a fresh lakehouse: both bronze feeds after six
 * batches with retention applied, a silver view, and a gold table.
 */
export function fixtureNight(): string[] {
  const porch = new BronzeFeed("porch_events");
  const bowls = new BronzeFeed("bowl_weights");
  for (let batch = 0; batch < DELIVERED; batch += 1) {
    porch.land(batch, porchBatch(batch));
    bowls.land(batch, bowlBatch(batch));
  }
  const kept = new Set(Array.from({ length: RETENTION }, (_, i) => DELIVERED - RETENTION + i));
  porch.retain(kept);
  bowls.retain(kept);
  return [
    "DROP SCHEMA IF EXISTS gold CASCADE",
    "DROP SCHEMA IF EXISTS silver CASCADE",
    "DROP SCHEMA IF EXISTS bronze CASCADE",
    "CREATE SCHEMA bronze",
    "CREATE SCHEMA silver",
    "CREATE SCHEMA gold",
    ...porch.statements(),
    ...bowls.statements(),
    `CREATE VIEW silver.latest_porch AS
       SELECT house, arg_max(state, _seq) AS state FROM bronze.porch_events GROUP BY house`,
    `CREATE TABLE gold.welcoming_houses AS
       SELECT house FROM silver.latest_porch WHERE state = 'on' ORDER BY house`,
  ];
}
