import { describe, expect, it } from "vitest";
import { parseEngineMessage, parseEngineRequest, requestIdOf } from "./protocol";

describe("parseEngineRequest", () => {
  it.each([
    { id: 1, kind: "init" },
    { id: 2, kind: "query", sql: "SELECT 1" },
    { id: 3, kind: "exec", sql: "CREATE TABLE t (x INT)" },
    { id: 4, kind: "registerFile", name: "a.csv", bytes: new Uint8Array([1]) },
    { id: 5, kind: "canonicalRead", relation: "gold" },
    { id: 6, kind: "reset" },
  ])("accepts $kind", (request) => {
    expect(parseEngineRequest(request)).toEqual(request);
  });

  it("drops fields a request kind does not carry", () => {
    expect(parseEngineRequest({ id: 1, kind: "reset", sql: "DROP TABLE x" })).toEqual({
      id: 1,
      kind: "reset",
    });
  });

  it.each([
    ["a non-object", "init"],
    ["a missing id", { kind: "init" }],
    ["a fractional id", { id: 1.5, kind: "init" }],
    ["an unknown kind", { id: 1, kind: "vacuum" }],
    ["a query without SQL", { id: 1, kind: "query" }],
    ["a file without bytes", { id: 1, kind: "registerFile", name: "a.csv", bytes: [1, 2] }],
    ["a read without a relation", { id: 1, kind: "canonicalRead", relation: 7 }],
  ])("rejects %s", (_, message) => {
    expect(parseEngineRequest(message)).toBeNull();
  });
});

describe("requestIdOf", () => {
  it("finds the id of a malformed request so it can still be answered", () => {
    expect(requestIdOf({ id: 7, kind: "vacuum" })).toBe(7);
    expect(requestIdOf({ kind: "init" })).toBeNull();
    expect(requestIdOf(null)).toBeNull();
  });
});

describe("parseEngineMessage", () => {
  it.each([
    { type: "status", status: { phase: "idle" } },
    { type: "status", status: { phase: "downloading", bytesLoaded: 5, bytesTotal: 10 } },
    { type: "status", status: { phase: "instantiating" } },
    { type: "status", status: { phase: "ready", version: "v1.4.3" } },
    { type: "status", status: { phase: "error", message: "no wasm" } },
    { type: "result", id: 1, ok: true, value: { rows: [] } },
    { type: "result", id: 2, ok: false, error: { code: "sql", message: "nope" } },
  ])("accepts %o", (message) => {
    expect(parseEngineMessage(message)).toEqual(message);
  });

  it.each([
    ["an unknown type", { type: "log", text: "hi" }],
    ["an unknown phase", { type: "status", status: { phase: "haunted" } }],
    ["progress without totals", { type: "status", status: { phase: "downloading" } }],
    ["ready without a version", { type: "status", status: { phase: "ready" } }],
    ["a result without an id", { type: "result", ok: true, value: 1 }],
    ["a result without ok", { type: "result", id: 1, value: 1 }],
    ["an unknown error code", { type: "result", id: 1, ok: false, error: { code: "boo" } }],
    ["an error without a message", { type: "result", id: 1, ok: false, error: { code: "sql" } }],
  ])("rejects %s", (_, message) => {
    expect(parseEngineMessage(message)).toBeNull();
  });
});
