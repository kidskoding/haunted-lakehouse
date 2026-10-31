import { describe, expect, it } from "vitest";
import { indexOfLineColumn, lineColumn } from "./position";

describe("indexOfLineColumn", () => {
  const text = "select a,\n  b\n\nfrom t";

  it("inverts lineColumn at every index, including the end of each line", () => {
    for (let index = 0; index <= text.length; index++) {
      expect(indexOfLineColumn(text, lineColumn(text, index))).toBe(index);
    }
  });

  it("rejects places outside the text", () => {
    expect(indexOfLineColumn(text, { line: 0, column: 1 })).toBeNull();
    expect(indexOfLineColumn(text, { line: 1, column: 0 })).toBeNull();
    expect(indexOfLineColumn(text, { line: 2, column: 5 })).toBeNull();
    expect(indexOfLineColumn(text, { line: 5, column: 1 })).toBeNull();
    expect(indexOfLineColumn(text, { line: 1.5, column: 1 })).toBeNull();
  });
});
