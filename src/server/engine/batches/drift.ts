import "server-only";
import type { Cell, Row } from "../puzzle";

/**
 * One change to a feed's shape. The built-in kinds cover what vendors actually do to a feed;
 * `custom` is the escape hatch, and its transform must be pure so the night stays seeded.
 */
export type DriftChange =
  | { readonly kind: "rename"; readonly column: string; readonly to: string }
  /** The value becomes text, with a unit when given: 12 becomes "12 g". Nulls stay null. */
  | { readonly kind: "stringify"; readonly column: string; readonly unit?: string }
  | { readonly kind: "add"; readonly column: string; readonly value: Cell }
  | { readonly kind: "drop"; readonly column: string }
  | { readonly kind: "custom"; readonly transform: (row: Row) => Row };

/** Applies one change to a row, keeping column order except where the change moves a column. */
export function applyDriftChange(row: Row, change: DriftChange): Row {
  switch (change.kind) {
    case "rename":
      return Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column === change.column ? change.to : column,
          value,
        ]),
      );
    case "stringify": {
      if (!(change.column in row)) return row;
      const value = row[change.column] ?? null;
      if (value === null) return row;
      const text = change.unit === undefined ? String(value) : `${String(value)} ${change.unit}`;
      return { ...row, [change.column]: text };
    }
    case "add":
      return { ...row, [change.column]: change.value };
    case "drop":
      return Object.fromEntries(Object.entries(row).filter(([column]) => column !== change.column));
    case "custom":
      return change.transform(row);
  }
}
