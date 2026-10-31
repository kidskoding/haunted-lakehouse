import { describe, expect, it } from "vitest";
import { formatClock, formatNumber, listOf, numberWord, plural, pluralWords } from "./format";

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [13, "13"],
    [1234, "1,234"],
    [1234567, "1,234,567"],
    [-4012, "-4,012"],
    [18.9, "18.9"],
    [12345.5, "12,345.5"],
  ])("prints %d as %s", (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });

  it("refuses values that aren't numbers", () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("number words and plurals", () => {
  it("says small whole numbers as words and the rest as digits", () => {
    expect(numberWord(0)).toBe("zero");
    expect(numberWord(3)).toBe("three");
    expect(numberWord(3, true)).toBe("Three");
    expect(numberWord(20)).toBe("twenty");
    expect(numberWord(21)).toBe("21");
    expect(numberWord(2.5)).toBe("2.5");
    expect(numberWord(-1)).toBe("-1");
  });

  it("agrees the noun with the count", () => {
    expect(plural(1, "house", "houses")).toBe("1 house");
    expect(plural(0, "house", "houses")).toBe("0 houses");
    expect(plural(1300, "piece", "pieces")).toBe("1,300 pieces");
    expect(pluralWords(1, "batch", "batches")).toBe("one batch");
    expect(pluralWords(3, "batch", "batches")).toBe("three batches");
  });

  it("lists items the way a person would", () => {
    expect(listOf(["7:00pm"])).toBe("7:00pm");
    expect(listOf(["7:00pm", "7:15pm"])).toBe("7:00pm and 7:15pm");
    expect(listOf(["7:00pm", "7:15pm", "7:30pm"])).toBe("7:00pm, 7:15pm and 7:30pm");
    expect(() => listOf([])).toThrow(RangeError);
  });
});

describe("formatClock", () => {
  it.each([
    ["18:00", "6:00pm"],
    ["19:05", "7:05pm"],
    ["23:15:00", "11:15pm"],
    ["00:00", "12:00am"],
    ["00:30-05:00", "12:30am"],
    ["2026-10-31 22:30:00", "10:30pm"],
    ["2026-11-01T02:00:00-06:00", "2:00am"],
    ["03:00", "3:00am"],
  ])("shows %s as %s", (text, face) => {
    expect(formatClock(text)).toBe(face);
  });

  it("names which 1am hour a time belongs to", () => {
    expect(formatClock("01:30-05:00")).toBe("the first 1:30am");
    expect(formatClock("2026-11-01 01:30:00-06:00")).toBe("the second 1:30am");
    expect(formatClock("01:00-06:00")).toBe("the second 1:00am");
  });

  it("refuses a 1am time that doesn't say which", () => {
    expect(() => formatClock("01:30")).toThrow(/happens twice/);
  });

  it.each([
    ["a time outside the night", "12:00"],
    ["a time after 3am", "03:01"],
    ["an evening time on the wrong date", "2026-11-01 19:00:00"],
    ["a small-hours time on the wrong date", "2026-10-31 00:30:00"],
    ["an offset the evening never had", "19:00-06:00"],
    ["an offset 2am never had", "02:15-05:00"],
    ["an impossible minute", "19:75"],
    ["a twelve-hour face", "7:00pm"],
  ])("refuses %s", (_, text) => {
    expect(() => formatClock(text)).toThrow(RangeError);
  });
});
