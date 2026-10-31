import type { CanonicalCell, CanonicalTable } from "../canonical/hash";
import { canonicalSelect, type DescribedColumn } from "../canonical/sql";
import { toQueryResult, type ArrowTableLike } from "./arrow";
import {
  parseEngineRequest,
  requestIdOf,
  type EngineMessage,
  type EngineRequest,
  type EngineResults,
  type EngineStatus,
} from "./protocol";

/** The database operations the host needs, so it can run on any DuckDB-WASM build. */
export interface Database {
  readonly version: string;
  readonly query: (sql: string) => Promise<ArrowTableLike>;
  readonly registerFile: (name: string, bytes: Uint8Array) => Promise<void>;
  /** Drops every table, view, and registered file, leaving an empty database. */
  readonly reset: () => Promise<void>;
}

/** Loads the database, reporting download and instantiation progress as it goes. */
export type LoadDatabase = (onStatus: (status: EngineStatus) => void) => Promise<Database>;

class UnavailableError extends Error {}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asCanonicalCell(value: unknown): CanonicalCell {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(`Canonical projection returned a ${typeof value}.`);
}

async function canonicalRead(db: Database, relation: string): Promise<CanonicalTable> {
  const described = toQueryResult(
    await db.query(`SELECT column_name, column_type FROM (DESCRIBE ${relation})`),
  );
  const columns: DescribedColumn[] = described.rows.map(([name, type]) => ({
    name: String(name),
    type: String(type),
  }));
  const result = toQueryResult(await db.query(canonicalSelect(relation, columns)));
  return {
    columns: result.columns.map((c) => c.name),
    rows: result.rows.map((row) => row.map(asCanonicalCell)),
  };
}

async function run(
  db: Database,
  request: EngineRequest,
): Promise<EngineResults[EngineRequest["kind"]]> {
  switch (request.kind) {
    case "init":
      return { version: db.version };
    case "query":
      return toQueryResult(await db.query(request.sql));
    case "exec":
      await db.query(request.sql);
      return null;
    case "registerFile":
      await db.registerFile(request.name, request.bytes);
      return null;
    case "canonicalRead":
      return canonicalRead(db, request.relation);
    case "reset":
      await db.reset();
      return null;
  }
}

/**
 * The worker side of the protocol: answers each message with exactly one result, never a
 * throw. The first request of any kind starts loading the database, and requests run one at
 * a time in arrival order, so a multi-step read never interleaves with a reset. A failed load
 * is not kept: requests that arrived during it share its failure, and the next one retries.
 */
export function createEngineHost(
  load: LoadDatabase,
  post: (message: EngineMessage) => void,
): (message: unknown) => void {
  let database: Promise<Database> | null = null;
  let queue: Promise<void> = Promise.resolve();

  // Called when a request arrives rather than when its turn in the queue comes, so a request
  // that arrived during a load waits on that load, even if it fails, instead of starting another.
  const ready = (): Promise<Database> => {
    if (database !== null) return database;
    // Wrapped so a loader that throws synchronously still fails as a rejected load.
    const loading = new Promise<Database>((resolve) => {
      resolve(
        load((status) => {
          post({ type: "status", status });
        }),
      );
    });
    const attempt = loading.then(
      (db) => {
        post({ type: "status", status: { phase: "ready", version: db.version } });
        return db;
      },
      (error: unknown) => {
        const message = messageOf(error);
        post({ type: "status", status: { phase: "error", message } });
        throw new UnavailableError(`The engine failed to load: ${message}`);
      },
    );
    database = attempt;
    // A failure may be transient, so forget it and let the next request load again.
    attempt.catch(() => {
      if (database === attempt) database = null;
    });
    return attempt;
  };

  const answer = async (request: EngineRequest, db: Promise<Database>): Promise<void> => {
    try {
      const value = await run(await db, request);
      post({ type: "result", id: request.id, ok: true, value });
    } catch (error) {
      const code = error instanceof UnavailableError ? "unavailable" : "sql";
      post({
        type: "result",
        id: request.id,
        ok: false,
        error: { code, message: messageOf(error) },
      });
    }
  };

  return (message) => {
    const request = parseEngineRequest(message);
    if (request === null) {
      const id = requestIdOf(message);
      if (id !== null) {
        post({
          type: "result",
          id,
          ok: false,
          error: { code: "bad-request", message: "The engine received a malformed request." },
        });
      }
      return;
    }
    const db = ready();
    queue = queue.then(() => answer(request, db));
  };
}
