import { describe, expect, it } from "vitest";
import { StepFailure, asStepFailure, sqlFailure } from "./failure";
import { nativeConnection } from "./test-connection";

async function duckdbError(sql: string): Promise<unknown> {
  const connection = await nativeConnection();
  await connection.run("CREATE TABLE t (a VARCHAR, b BIGINT)");
  try {
    await connection.run(sql);
  } catch (error) {
    return error;
  }
  throw new Error("The statement succeeded.");
}

describe("sqlFailure", () => {
  it("maps DuckDB's position past the executor's own lines, and drops its location trailer", async () => {
    const model = "select a,\n  nope from t";
    const failure = sqlFailure(await duckdbError(`CREATE TABLE x AS\n${model}`), model, 1);
    expect(failure.message).toBe(
      'Binder Error: Referenced column "nope" not found in FROM clause!\nCandidate bindings: "a"',
    );
    expect(failure.position).toEqual({ line: 2, column: 3 });
  });

  it("finds the column on a long line DuckDB cuts down around the spot", async () => {
    const model = `select a, ${"b + 1 as q, ".repeat(20)} nope from t`;
    const failure = sqlFailure(await duckdbError(`CREATE TABLE x AS\n${model}`), model, 1);
    expect(failure.position).toEqual({ line: 1, column: model.indexOf("nope") + 1 });
  });

  it("leaves out a position that falls in the executor's own lines", () => {
    const failure = sqlFailure(
      new Error("Parser Error: oops\n\nLINE 1: CREATE x\n        ^"),
      "x",
      1,
    );
    expect(failure).toMatchObject({ code: "sql", message: "Parser Error: oops" });
    expect(failure.position).toBeUndefined();
  });

  it("keeps a message without a position as it is", () => {
    expect(sqlFailure(new Error("Out of Memory Error"), "x", 1).message).toBe(
      "Out of Memory Error",
    );
  });
});

describe("asStepFailure", () => {
  it("passes step failures through and wraps anything else as an sql failure", () => {
    const failure = new StepFailure("null_key", "no");
    expect(asStepFailure(failure)).toBe(failure);
    expect(asStepFailure("boom")).toMatchObject({ code: "sql", message: "boom" });
  });

  it("drops the location trailer of an error raised by the executor's own SQL", () => {
    const failure = asStepFailure(
      new Error('Conversion Error: oops\n\nLINE 1: CREATE TABLE "__hl"."staged" AS x\n        ^'),
    );
    expect(failure).toMatchObject({ code: "sql", message: "Conversion Error: oops" });
    expect(failure.position).toBeUndefined();
  });
});
