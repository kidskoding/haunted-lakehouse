/**
 * The canonical form of a gold table, shared by the browser (the player's result) and the
 * server (the expected result), so both sides hash exactly the same text.
 *
 * Rules:
 * - Column names compare case-insensitively, as SQL identifiers do, and are sorted.
 * - Rows are a multiset: order never matters, duplicates do.
 * - Numbers round to {@link DECIMAL_PLACES} places; -0 is 0; NaN and the infinities keep
 *   their names. Integers and floats with the same value are equal. Every number is a
 *   double, so integers beyond 2^53 compare at double precision.
 * - Null differs from every value, including the string "null".
 * - Strings compare exactly, code unit by code unit, with no Unicode normalization.
 */

/** A value after canonical projection: what both DuckDB builds return for it. */
export type CanonicalCell = string | number | boolean | null;

export interface CanonicalTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly CanonicalCell[])[];
}

export const DECIMAL_PLACES = 6;

/** The canonical text of a number: rounded, with no trailing zeros or negative zero. */
export function canonicalNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  // toFixed is exact over the double's true decimal value, so it rounds the same everywhere.
  const rounded = Number(value.toFixed(DECIMAL_PLACES));
  return String(rounded === 0 ? 0 : rounded);
}

function encodeCell(cell: CanonicalCell): string | boolean | null {
  if (cell === null || typeof cell === "boolean") return cell;
  if (typeof cell === "number") return `n:${canonicalNumber(cell)}`;
  return `s:${cell}`;
}

/** The exact text that gets hashed. Exposed so a failing comparison can be diffed. */
export function canonicalText(table: CanonicalTable): string {
  const names = table.columns.map((c) => c.toLowerCase());
  const order = names.map((_, i) => i).sort((a, b) => compare(names[a] ?? "", names[b] ?? ""));
  const sortedNames = order.map((i) => names[i] ?? "");
  if (new Set(sortedNames).size !== sortedNames.length) {
    throw new Error(`A gold table has two columns with the same name: ${sortedNames.join(", ")}.`);
  }

  const rows = table.rows.map((row, r) => {
    if (row.length !== names.length) {
      throw new Error(
        `Row ${String(r)} has ${String(row.length)} values for ${String(names.length)} columns.`,
      );
    }
    return JSON.stringify(order.map((i) => encodeCell(row[i] ?? null)));
  });
  rows.sort(compare);
  return [JSON.stringify(sortedNames), ...rows].join("\n");
}

// Plain code-unit comparison: localeCompare would depend on the runtime's ICU data.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** SHA-256 of the canonical text, as lowercase hex. */
export async function hashTable(table: CanonicalTable): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalText(table)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Arranges keyed rows (as puzzle generators write expected state) into a canonical table. */
export function tableFromRows(
  columns: readonly string[],
  rows: readonly Readonly<Record<string, CanonicalCell>>[],
): CanonicalTable {
  return {
    columns,
    rows: rows.map((row, r) => {
      const keys = Object.keys(row);
      if (keys.length !== columns.length || keys.some((k) => !columns.includes(k))) {
        throw new Error(
          `Row ${String(r)} has columns ${keys.join(", ")}, not ${columns.join(", ")}.`,
        );
      }
      return columns.map((c) => row[c] ?? null);
    }),
  };
}
