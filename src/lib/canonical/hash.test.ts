import { describe, expect, it } from "vitest";
import {
  canonicalNumber,
  canonicalText,
  hashTable,
  tableFromRows,
  type CanonicalTable,
} from "./hash";

const table = (columns: string[], rows: CanonicalTable["rows"]): CanonicalTable => ({
  columns,
  rows,
});

async function sameHash(a: CanonicalTable, b: CanonicalTable): Promise<boolean> {
  return (await hashTable(a)) === (await hashTable(b));
}

describe("canonicalNumber", () => {
  it.each<[number, string]>([
    [0.1 + 0.2, "0.3"],
    [1 / 3, "0.333333"],
    [2 / 3, "0.666667"],
    [-0, "0"],
    [-0.0000001, "0"],
    [42, "42"],
    [12.5, "12.5"],
    [1e21, "1e+21"],
    [-1e-7, "0"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
    [Number.NEGATIVE_INFINITY, "-Infinity"],
  ])("writes %s as %s", (value, text) => {
    expect(canonicalNumber(value)).toBe(text);
  });
});

describe("hashTable", () => {
  const base = table(
    ["house", "candles"],
    [
      ["a", 1],
      ["b", 2],
    ],
  );

  it("is a 64-character hex SHA-256", async () => {
    expect(await hashTable(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores row order and column order", async () => {
    expect(
      await sameHash(
        base,
        table(
          ["candles", "house"],
          [
            [2, "b"],
            [1, "a"],
          ],
        ),
      ),
    ).toBe(true);
  });

  it("treats column names case-insensitively", async () => {
    expect(
      await sameHash(
        base,
        table(
          ["HOUSE", "Candles"],
          [
            ["a", 1],
            ["b", 2],
          ],
        ),
      ),
    ).toBe(true);
  });

  it("counts duplicate rows", async () => {
    expect(
      await sameHash(
        base,
        table(
          ["house", "candles"],
          [
            ["a", 1],
            ["b", 2],
            ["b", 2],
          ],
        ),
      ),
    ).toBe(false);
  });

  it("equates numbers within rounding and integers with whole floats", async () => {
    expect(
      await sameHash(
        base,
        table(
          ["house", "candles"],
          [
            ["a", 1.0000001],
            ["b", 2.0],
          ],
        ),
      ),
    ).toBe(true);
    expect(
      await sameHash(
        base,
        table(
          ["house", "candles"],
          [
            ["a", 1.000001],
            ["b", 2],
          ],
        ),
      ),
    ).toBe(false);
  });

  it.each<[string, CanonicalTable]>([
    [
      "a null for a value",
      table(
        ["house", "candles"],
        [
          ["a", null],
          ["b", 2],
        ],
      ),
    ],
    [
      "the string 'null' for a null",
      table(
        ["house", "candles"],
        [
          ["a", 1],
          ["null", 2],
        ],
      ),
    ],
    [
      "a string for a number",
      table(
        ["house", "candles"],
        [
          ["a", "1"],
          ["b", 2],
        ],
      ),
    ],
    [
      "a boolean for a number",
      table(
        ["house", "candles"],
        [
          ["a", true],
          ["b", 2],
        ],
      ),
    ],
    [
      "a renamed column",
      table(
        ["home", "candles"],
        [
          ["a", 1],
          ["b", 2],
        ],
      ),
    ],
    [
      "a decomposed accent",
      table(
        ["house", "candles"],
        [
          ["a", 1],
          ["b́", 2],
        ],
      ),
    ],
    [
      "an extra column",
      table(
        ["house", "candles", "x"],
        [
          ["a", 1, null],
          ["b", 2, null],
        ],
      ),
    ],
    ["a missing row", table(["house", "candles"], [["a", 1]])],
  ])("tells apart %s", async (_, other) => {
    expect(await sameHash(base, other)).toBe(false);
  });

  it("keeps null and the string 'null' apart within a cell", () => {
    const text = canonicalText(table(["x"], [[null], ["null"]]));
    expect(text.split("\n").slice(1).sort()).toEqual(['["s:null"]', "[null]"]);
  });

  it("cannot be fooled by separators inside strings", async () => {
    const joined = table(["a", "b"], [['x","s:y', "z"]]);
    const split = table(["a", "b"], [["x", 'y","s:z']]);
    expect(await sameHash(joined, split)).toBe(false);
  });

  it("hashes an empty table by its columns", async () => {
    expect(await sameHash(table(["a"], []), table(["b"], []))).toBe(false);
    expect(await sameHash(table(["a"], []), table(["A"], []))).toBe(true);
  });

  it("rejects duplicate column names and ragged rows", () => {
    expect(() => canonicalText(table(["a", "A"], []))).toThrow(/same name/);
    expect(() => canonicalText(table(["a", "b"], [["x"]]))).toThrow(/1 values for 2 columns/);
  });
});

describe("tableFromRows", () => {
  it("arranges keyed rows by the given columns", () => {
    expect(tableFromRows(["a", "b"], [{ b: 2, a: 1 }]).rows).toEqual([[1, 2]]);
  });

  it("rejects rows whose keys do not match the columns", () => {
    expect(() => tableFromRows(["a", "b"], [{ a: 1 }])).toThrow(/Row 0 has columns a/);
    expect(() => tableFromRows(["a"], [{ a: 1, c: 3 }])).toThrow(/Row 0/);
  });
});
