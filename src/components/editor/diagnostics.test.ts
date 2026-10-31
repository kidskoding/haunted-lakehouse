import { describe, expect, it } from "vitest";
import { errorsForPath, errorsToDiagnostics } from "./diagnostics";
import type { EditorError } from "./types";

describe("errorsToDiagnostics", () => {
  it("maps a line and column onto a one-character diagnostic span", () => {
    const source = "select count(*) as n form bronze.porch_events\n";
    const errors: readonly EditorError[] = [
      {
        path: "gold/broken_count.sql",
        message: 'syntax error at or near "form"',
        line: 1,
        column: 24,
      },
    ];
    const diagnostics = errorsToDiagnostics(source, errors);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.from).toBe(23);
    expect(diagnostics[0]?.to).toBe(24);
    expect(diagnostics[0]?.message).toContain("form");
    expect(diagnostics[0]?.severity).toBe("error");
  });

  it("falls back to the start of the file when no place is given", () => {
    const diagnostics = errorsToDiagnostics("select 1\n", [
      { path: "gold/x.sql", message: "unknown relation" },
    ]);
    expect(diagnostics[0]).toMatchObject({ from: 0, to: 1, severity: "error" });
  });
});

describe("errorsForPath", () => {
  it("keeps only errors for the open file", () => {
    const errors: readonly EditorError[] = [
      { path: "gold/a.sql", message: "a" },
      { path: "gold/b.sql", message: "b" },
    ];
    expect(errorsForPath("gold/b.sql", errors)).toEqual([{ path: "gold/b.sql", message: "b" }]);
  });
});
