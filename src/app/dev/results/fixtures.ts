import type { QueryCell, QueryResult } from "@/lib/engine/protocol";

/** A handful of porch-light rows, the kind Preview returns early in Act I. */
export const porchLights: QueryResult = {
  columns: [
    { name: "house_id", type: "Utf8" },
    { name: "street", type: "Utf8" },
    { name: "lit", type: "Bool" },
    { name: "last_seen_at", type: "Utf8" },
    { name: "events", type: "Int64" },
  ],
  rows: [
    ["willow-12", "Willow Lane", true, "2026-10-31 18:12:04", 4n],
    ["willow-14", "Willow Lane", false, "2026-10-31 18:04:51", 2n],
    ["cedar-3", "Cedar Court", true, "2026-10-31 18:19:33", 7n],
    ["oak-9", "Oak Street", true, null, 1n],
    ["mist-1", "Mist Alley", false, "2026-10-31 17:58:12", 0n],
    ["raven-22", "Raven Road", true, "2026-10-31 18:21:00", 11n],
    ["hollow-0", "Hollow Creek Rd", false, "2026-10-31 18:00:00", 3n],
    ["porch-null", "Willow Lane", null, "", 0n],
  ],
};

/** Wide enough to force horizontal scroll and column virtualization. */
export const wideSchema: QueryResult = {
  columns: Array.from({ length: 24 }, (_, i) => ({
    name: i === 0 ? "batch" : `col_${String(i).padStart(2, "0")}`,
    type: i === 0 ? "Int32" : i % 3 === 0 ? "Float64" : "Utf8",
  })),
  rows: Array.from({ length: 40 }, (_, r) =>
    Array.from({ length: 24 }, (_, c): QueryCell => {
      if (c === 0) return r;
      if (c % 3 === 0) return r * 0.25 + c;
      if (c % 7 === 0) return null;
      return `b${String(r)}/${String(c)}`;
    }),
  ),
};

/** Tall enough that only a window of rows renders at a time. */
export function manyRows(count: number): QueryResult {
  return {
    columns: [
      { name: "seq", type: "Int64" },
      { name: "house_id", type: "Utf8" },
      { name: "weight_g", type: "Float64" },
      { name: "note", type: "Utf8" },
    ],
    rows: Array.from({ length: count }, (_, i) => [
      BigInt(i + 1),
      `house-${String((i % 48) + 1).padStart(2, "0")}`,
      (i % 17) * 12.5,
      i % 11 === 0 ? null : i % 5 === 0 ? `refill at ${String(i)}` : "",
    ]),
  };
}

export const emptyRows: QueryResult = {
  columns: [
    { name: "house_id", type: "Utf8" },
    { name: "lit", type: "Bool" },
  ],
  rows: [],
};

export const noColumns: QueryResult = {
  columns: [],
  rows: [],
};

export const binderError = {
  message: "DuckDB rejected the SQL.",
  details:
    'Binder Error: Table "bronze.missing_feed" does not exist!\n\nLINE 1: select * from bronze.missing_feed\n                      ^',
} as const;
