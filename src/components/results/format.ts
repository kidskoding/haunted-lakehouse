import type { QueryCell, QueryColumn } from "@/lib/engine/protocol";

/** How a cell reads in the grid: its text and the kind that decides its style. */
export interface FormattedCell {
  readonly text: string;
  readonly kind: "null" | "number" | "boolean" | "text";
}

const NULL_CELL: FormattedCell = { text: "NULL", kind: "null" };

/** A DOUBLE as DuckDB prints the values JavaScript spells differently. */
function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  return String(value);
}

/**
 * A cell's display text. BIGINT prints exactly, and temporal, DECIMAL, and BLOB values are
 * already DuckDB's own text, so they pass through untouched.
 */
export function formatCell(cell: QueryCell): FormattedCell {
  if (cell === null) return NULL_CELL;
  switch (typeof cell) {
    case "bigint":
      return { text: cell.toString(), kind: "number" };
    case "number":
      return { text: formatNumber(cell), kind: "number" };
    case "boolean":
      return { text: cell ? "true" : "false", kind: "boolean" };
    default:
      return { text: cell, kind: "text" };
  }
}

// Arrow's names for the types DuckDB returns as numbers; DECIMAL arrives as text but is one.
const NUMERIC_TYPE = /^(u?int\d+|float\d*|decimal|halffloat)/i;

/** Whether a column holds numbers, so it aligns right whatever its cells' JavaScript type. */
export function isNumericColumn(column: QueryColumn): boolean {
  return NUMERIC_TYPE.test(column.type);
}

/** One TSV field, quoted as spreadsheets expect when it holds a tab, newline, or quote. */
function tsvField(cell: QueryCell): string {
  if (cell === null) return "";
  const { text } = formatCell(cell);
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A block of rows as tab-separated text, with an optional header line of column names. */
export function toTsv(rows: readonly (readonly QueryCell[])[], header?: readonly string[]): string {
  const lines = rows.map((row) => row.map(tsvField).join("\t"));
  if (header) lines.unshift(header.map(tsvField).join("\t"));
  return lines.join("\n");
}

const COUNT = new Intl.NumberFormat("en-US");

/** A count with thousands separators, for row numbers and totals. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}
