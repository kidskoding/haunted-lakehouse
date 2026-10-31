import { describe, expect, it } from "vitest";
import { canonicalSelect, quoteIdentifier } from "./sql";

describe("canonicalSelect", () => {
  it("projects each column to a value both DuckDB builds return alike", () => {
    expect(
      canonicalSelect("gold.totals", [
        { name: "n", type: "BIGINT" },
        { name: "amount", type: "DECIMAL(18,3)" },
        { name: "ok", type: "BOOLEAN" },
        { name: "name", type: "VARCHAR" },
        { name: "at", type: "TIMESTAMP" },
        { name: "at_utc", type: "TIMESTAMP WITH TIME ZONE" },
      ]),
    ).toBe(
      'SELECT CAST("n" AS DOUBLE) AS "n", CAST("amount" AS DOUBLE) AS "amount", "ok" AS "ok", ' +
        '"name" AS "name", CAST("at" AS VARCHAR) AS "at", ' +
        'CAST(make_timestamp(epoch_us("at_utc")) AS VARCHAR) AS "at_utc" FROM gold.totals',
    );
  });

  it("quotes identifiers safely", () => {
    expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
  });

  it("refuses a relation with no columns", () => {
    expect(() => canonicalSelect("t", [])).toThrow(/no columns/);
  });
});
