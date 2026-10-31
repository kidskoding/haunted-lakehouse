import type { QueryCell, QueryResult } from "./protocol";
import {
  formatBlob,
  formatDate,
  formatDecimal,
  formatInterval,
  formatTime,
  formatTimestamp,
  TimeUnit,
} from "./text";

/**
 * The slice of an Arrow table this module reads, typed structurally so engine code depends on
 * DuckDB-WASM's public API rather than on apache-arrow, which only DuckDB-WASM declares.
 */
export interface ArrowTableLike {
  readonly numRows: number;
  readonly schema: { readonly fields: readonly ArrowFieldLike[] };
  readonly getChildAt: (index: number) => ArrowVectorLike | null;
}

interface ArrowFieldLike {
  readonly name: string;
  readonly type: ArrowTypeLike;
}

interface ArrowTypeLike {
  readonly typeId: number;
  readonly unit?: unknown;
  readonly scale?: unknown;
  readonly timezone?: unknown;
  readonly toString: () => string;
}

interface ArrowVectorLike {
  readonly data: readonly ArrowDataLike[];
  readonly get: (index: number) => unknown;
}

interface ArrowDataLike {
  readonly length: number;
  readonly offset: number;
  readonly values: unknown;
  readonly getValid: (index: number) => boolean;
}

/** Reads the cell at `index` within one chunk, which is row `row` of the whole column. */
type CellReader = (data: ArrowDataLike, index: number, row: number) => QueryCell;

// Arrow's Type enum and DateUnit, from its schema definition.
const ArrowType = {
  binary: 4,
  decimal: 7,
  date: 8,
  time: 9,
  timestamp: 10,
  interval: 11,
} as const;
const DATE_UNIT_DAY = 0;

function timeUnitOf(type: ArrowTypeLike): TimeUnit | null {
  return Object.values(TimeUnit).find((u) => u === type.unit) ?? null;
}

/** The stored integer at `index`, read from the buffer so no precision is lost. */
function stored(data: ArrowDataLike, index: number): bigint {
  const { values } = data;
  if (values instanceof BigInt64Array || values instanceof Int32Array) {
    const value = values[data.offset + index];
    if (value !== undefined) return BigInt(value);
  }
  throw new Error("An Arrow column had an unexpected buffer layout.");
}

function intervalAt(data: ArrowDataLike, index: number): string {
  // MONTH_DAY_NANO packs int32 months, int32 days, and int64 nanoseconds per value.
  const { values } = data;
  if (!(values instanceof Int32Array)) throw new Error("An interval had no Int32 buffer.");
  const base = (data.offset + index) * 4;
  const [months, days, low, high] = values.subarray(base, base + 4);
  if (months === undefined || days === undefined || low === undefined || high === undefined) {
    throw new Error("An interval value was truncated.");
  }
  const nanos = (BigInt(high) << 32n) | BigInt(low >>> 0);
  return formatInterval(months, days, nanos / 1000n);
}

/** A value Arrow decoded faithfully, as a structured-clone-safe cell. */
function plain(value: unknown): QueryCell {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  // Lists, structs, and maps arrive as Arrow objects that define their own JSON form.
  return JSON.stringify(value, (_, inner: unknown) =>
    typeof inner === "bigint" ? inner.toString() : inner,
  );
}

function readerFor(type: ArrowTypeLike, vector: ArrowVectorLike): CellReader {
  const unit = timeUnitOf(type);
  const { scale } = type;
  switch (type.typeId) {
    case ArrowType.date:
      if (type.unit === DATE_UNIT_DAY) return (data, i) => formatDate(Number(stored(data, i)));
      break;
    case ArrowType.time:
      if (unit !== null) return (data, i) => formatTime(stored(data, i), unit);
      break;
    case ArrowType.timestamp: {
      const zoned = typeof type.timezone === "string" && type.timezone !== "";
      if (unit !== null) return (data, i) => formatTimestamp(stored(data, i), unit, zoned);
      break;
    }
    case ArrowType.interval:
      return intervalAt;
    case ArrowType.decimal:
      // Arrow's decimal value prints as its unscaled integer; the scale lives on the type.
      if (typeof scale === "number") {
        return (_, __, row) => formatDecimal(BigInt(String(vector.get(row))), scale);
      }
      break;
    case ArrowType.binary:
      return (_, __, row) => {
        const value = vector.get(row);
        return value instanceof Uint8Array ? formatBlob(value) : plain(value);
      };
  }
  return (_, __, row) => plain(vector.get(row));
}

function readColumn(field: ArrowFieldLike, vector: ArrowVectorLike): QueryCell[] {
  const read = readerFor(field.type, vector);
  const cells: QueryCell[] = [];
  for (const data of vector.data) {
    for (let i = 0; i < data.length; i += 1) {
      cells.push(data.getValid(i) ? read(data, i, cells.length) : null);
    }
  }
  return cells;
}

/**
 * Converts a DuckDB result into plain rows that survive `postMessage`. Temporal, DECIMAL,
 * and BLOB values become DuckDB's own text for them, which Arrow's decoding would lose.
 */
export function toQueryResult(table: ArrowTableLike): QueryResult {
  const { fields } = table.schema;
  const columns = fields.map((field, c) => {
    const vector = table.getChildAt(c);
    if (vector === null) throw new Error(`Result column ${field.name} is missing.`);
    return readColumn(field, vector);
  });
  return {
    columns: fields.map((field) => ({ name: field.name, type: String(field.type) })),
    rows: Array.from({ length: table.numRows }, (_, r) => columns.map((cells) => cells[r] ?? null)),
  };
}
