import { describe, expect, it } from "vitest";
import { canonicalText, tableFromRows } from "../canonical/hash";
import { createEngineHost, type Database, type LoadDatabase } from "./host";
import type { EngineMessage, EngineResponse, EngineStatus } from "./protocol";
import { wasmDatabase } from "./testing/wasm-duckdb";

/** A host plus everything it posted, with a way to await the answer to one request. */
function harness(load: LoadDatabase) {
  const posted: EngineMessage[] = [];
  const waiting = new Map<number, (response: EngineResponse) => void>();
  const handle = createEngineHost(load, (message) => {
    posted.push(message);
    if (message.type === "result") waiting.get(message.id)?.(message);
  });
  let nextId = 1;
  const send = (request: Record<string, unknown>): Promise<EngineResponse> => {
    const id = nextId;
    nextId += 1;
    const answer = new Promise<EngineResponse>((resolve) => waiting.set(id, resolve));
    handle({ id, ...request });
    return answer;
  };
  const statuses = (): EngineStatus[] =>
    posted.flatMap((message) => (message.type === "status" ? [message.status] : []));
  return { handle, send, posted, statuses };
}

function valueOf(response: EngineResponse): unknown {
  if (!response.ok) throw new Error(`Expected success, got ${response.error.message}`);
  return response.value;
}

// One instance for the suite, emptied before each use: instantiating WASM costs about a
// second of CPU, which the rest of the test run would feel.
let shared: Promise<Database> | null = null;

const loadFresh: LoadDatabase = async (onStatus) => {
  onStatus({ phase: "downloading", bytesLoaded: 0, bytesTotal: 10 });
  onStatus({ phase: "instantiating" });
  shared ??= wasmDatabase();
  const db = await shared;
  await db.reset();
  return db;
};

describe("createEngineHost", () => {
  it("loads once on the first request, reports progress, then ready", async () => {
    let loads = 0;
    const { send, statuses } = harness((onStatus) => {
      loads += 1;
      return loadFresh(onStatus);
    });
    const [init, query] = await Promise.all([
      send({ kind: "init" }),
      send({ kind: "query", sql: "SELECT 42 AS n" }),
    ]);
    expect(loads).toBe(1);
    expect(valueOf(init)).toEqual({ version: "v1.4.3" });
    expect(valueOf(query)).toEqual({ columns: [{ name: "n", type: "Int32" }], rows: [[42]] });
    expect(statuses()).toEqual([
      { phase: "downloading", bytesLoaded: 0, bytesTotal: 10 },
      { phase: "instantiating" },
      { phase: "ready", version: "v1.4.3" },
    ]);
  }, 60_000);

  it("runs requests in arrival order without the caller awaiting each one", async () => {
    const { send } = harness(loadFresh);
    const create = send({ kind: "exec", sql: "CREATE TABLE porch (house TEXT)" });
    const insert = send({ kind: "exec", sql: "INSERT INTO porch VALUES ('Maple'), ('Willow')" });
    const read = send({ kind: "query", sql: "SELECT count(*)::INT AS n FROM porch" });
    expect(valueOf(await create)).toBeNull();
    expect(valueOf(await insert)).toBeNull();
    expect(valueOf(await read)).toMatchObject({ rows: [[2]] });
  }, 60_000);

  it("answers bad SQL with an error result instead of throwing", async () => {
    const { send } = harness(loadFresh);
    const response = await send({ kind: "query", sql: "SELECT * FROM missing_table" });
    expect(response).toMatchObject({ ok: false, error: { code: "sql" } });
    if (!response.ok) expect(response.error.message).toContain("missing_table");
    expect(valueOf(await send({ kind: "query", sql: "SELECT 1 AS one" }))).toMatchObject({
      rows: [[1]],
    });
  }, 60_000);

  it("reads registered CSV bytes as a file", async () => {
    const { send } = harness(loadFresh);
    const bytes = new TextEncoder().encode("house,candy\nMaple,13\nWillow,7\n");
    expect(valueOf(await send({ kind: "registerFile", name: "bowls.csv", bytes }))).toBeNull();
    const response = await send({
      kind: "query",
      sql: "SELECT house, candy::INT AS candy FROM read_csv('bowls.csv') ORDER BY house",
    });
    expect(valueOf(response)).toMatchObject({
      rows: [
        ["Maple", 13],
        ["Willow", 7],
      ],
    });
  }, 60_000);

  it("reads a relation in the canonical form the server hashes", async () => {
    const { send } = harness(loadFresh);
    const created = await send({
      kind: "exec",
      sql: `CREATE TABLE gold AS SELECT * FROM (VALUES
        (1, 12.50::DECIMAL(6, 2), TIMESTAMP '2026-10-31 18:00:00', 'Maple'),
        (2, NULL, TIMESTAMP '2026-11-01 01:30:00.5', 'Willow')) t(id, weight, seen, house)`,
    });
    expect(valueOf(created)).toBeNull();
    const response = await send({ kind: "canonicalRead", relation: "gold" });
    const expected = tableFromRows(
      ["house", "seen", "weight", "id"],
      [
        { id: 2, weight: null, seen: "2026-11-01 01:30:00.5", house: "Willow" },
        { id: 1, weight: 12.5, seen: "2026-10-31 18:00:00", house: "Maple" },
      ],
    );
    const table = valueOf(response);
    expect(table).toMatchObject({ columns: ["id", "weight", "seen", "house"] });
    expect(canonicalText(table as Parameters<typeof canonicalText>[0])).toBe(
      canonicalText(expected),
    );
  }, 60_000);

  it("reset drops every table and registered file", async () => {
    const { send } = harness(loadFresh);
    await send({ kind: "registerFile", name: "a.csv", bytes: new TextEncoder().encode("x\n1\n") });
    await send({ kind: "exec", sql: "CREATE TABLE t AS SELECT * FROM read_csv('a.csv')" });
    expect(valueOf(await send({ kind: "reset" }))).toBeNull();
    const tables = await send({ kind: "query", sql: "SELECT count(*)::INT FROM duckdb_tables()" });
    expect(valueOf(tables)).toMatchObject({ rows: [[0]] });
    const file = await send({ kind: "query", sql: "SELECT * FROM read_csv('a.csv')" });
    expect(file).toMatchObject({ ok: false, error: { code: "sql" } });
  }, 60_000);

  it("answers a malformed request that has an id, and ignores one without", async () => {
    const { send, handle, posted } = harness(loadFresh);
    expect(await send({ kind: "query" })).toMatchObject({
      ok: false,
      error: { code: "bad-request" },
    });
    expect(await send({ kind: "drop-everything" })).toMatchObject({
      ok: false,
      error: { code: "bad-request" },
    });
    const before = posted.length;
    handle({ kind: "init" });
    handle("init");
    expect(posted).toHaveLength(before);
  });

  it("reports a failed load as status and answers every request as unavailable", async () => {
    const { send, statuses } = harness(() => Promise.reject(new Error("no wasm for you")));
    const [first, second] = await Promise.all([
      send({ kind: "init" }),
      send({ kind: "query", sql: "SELECT 1" }),
    ]);
    for (const response of [first, second]) {
      expect(response).toMatchObject({ ok: false, error: { code: "unavailable" } });
      if (!response.ok) expect(response.error.message).toContain("no wasm for you");
    }
    expect(statuses()).toEqual([{ phase: "error", message: "no wasm for you" }]);
  });
});
