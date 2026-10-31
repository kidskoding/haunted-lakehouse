import { describe, expect, it } from "vitest";
import { formatCell, formatCount, isNumericColumn, toTsv } from "./format";

describe("formatCell", () => {
  it("prints a bigint exactly, past the double's safe range", () => {
    expect(formatCell(9_007_199_254_740_993n)).toEqual({
      text: "9007199254740993",
      kind: "number",
    });
    expect(formatCell(-42n)).toEqual({ text: "-42", kind: "number" });
  });

  it("marks NULL apart from an empty string and the word NULL", () => {
    expect(formatCell(null)).toEqual({ text: "NULL", kind: "null" });
    expect(formatCell("")).toEqual({ text: "", kind: "text" });
    expect(formatCell("NULL")).toEqual({ text: "NULL", kind: "text" });
  });

  it("passes DuckDB's temporal text through untouched", () => {
    for (const text of [
      "2026-10-31",
      "2026-10-31 19:00:00",
      "2026-11-01 01:30:00+00",
      "0044-03-15 (BC)",
      "1 day 01:00:00",
      "infinity",
    ]) {
      expect(formatCell(text)).toEqual({ text, kind: "text" });
    }
  });

  it("prints doubles and their special values as DuckDB does", () => {
    expect(formatCell(12.5).text).toBe("12.5");
    expect(formatCell(Number.NaN).text).toBe("nan");
    expect(formatCell(Infinity).text).toBe("inf");
    expect(formatCell(-Infinity).text).toBe("-inf");
  });

  it("prints booleans as words", () => {
    expect(formatCell(true)).toEqual({ text: "true", kind: "boolean" });
    expect(formatCell(false)).toEqual({ text: "false", kind: "boolean" });
  });
});

describe("isNumericColumn", () => {
  it("knows Arrow's numeric types, DECIMAL included", () => {
    for (const type of ["Int64", "Int32", "Uint8", "Float64", "Decimal[18e2]"]) {
      expect(isNumericColumn({ name: "n", type })).toBe(true);
    }
    for (const type of ["Utf8", "Bool", "Date32<DAY>", "Timestamp<MICROSECOND>", "Interval"]) {
      expect(isNumericColumn({ name: "n", type })).toBe(false);
    }
  });
});

describe("toTsv", () => {
  it("joins cells with tabs and rows with newlines, NULL as an empty field", () => {
    expect(
      toTsv([
        [1n, "Wren", null],
        [2n, "Marisol", 3.5],
      ]),
    ).toBe("1\tWren\t\n2\tMarisol\t3.5");
  });

  it("puts the header first when given", () => {
    expect(toTsv([[true]], ["lit"])).toBe("lit\ntrue");
  });

  it("quotes a field holding a tab, newline, or quote", () => {
    expect(toTsv([["a\tb", "two\nlines", 'say "boo"', "plain"]])).toBe(
      '"a\tb"\t"two\nlines"\t"say ""boo"""\tplain',
    );
  });

  it("copies nothing for no rows", () => {
    expect(toTsv([])).toBe("");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1_000_000)).toBe("1,000,000");
    expect(formatCount(7)).toBe("7");
  });
});
