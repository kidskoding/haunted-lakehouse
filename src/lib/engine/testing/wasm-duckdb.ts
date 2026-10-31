import { createRequire } from "node:module";
import path from "node:path";
import type * as WasmModule from "@duckdb/duckdb-wasm";
import type { ArrowTableLike } from "../arrow";
import type { Database } from "../host";

// The WASM build run in-process under Node, so tests decode results with the same
// apache-arrow version the player's browser uses.

interface BlockingConnection {
  query(sql: string): ArrowTableLike;
  close(): void;
}

interface BlockingDuckDB {
  instantiate(): Promise<void>;
  open(config: object): void;
  connect(): BlockingConnection;
  getVersion(): string;
  registerFileBuffer(name: string, buffer: Uint8Array): void;
  dropFiles(): void;
  reset(): void;
}

const require = createRequire(import.meta.url);
const entry = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
const duckdbWasm = require(entry) as typeof WasmModule & {
  createDuckDB: (
    bundles: Record<string, { mainModule: string; mainWorker: string }>,
    logger: unknown,
    runtime: unknown,
  ) => Promise<BlockingDuckDB>;
  NODE_RUNTIME: unknown;
};

/** An empty in-memory DuckDB-WASM database behind the engine host's interface. */
export async function wasmDatabase(): Promise<Database> {
  const dist = path.dirname(entry);
  const db = await duckdbWasm.createDuckDB(
    {
      mvp: { mainModule: path.join(dist, "duckdb-mvp.wasm"), mainWorker: "" },
      eh: { mainModule: path.join(dist, "duckdb-eh.wasm"), mainWorker: "" },
    },
    new duckdbWasm.VoidLogger(),
    duckdbWasm.NODE_RUNTIME,
  );
  await db.instantiate();
  db.open({});
  let connection = db.connect();
  return {
    version: db.getVersion(),
    query: (sql) => Promise.resolve(connection.query(sql)),
    registerFile: (name, bytes) => {
      db.registerFileBuffer(name, bytes);
      return Promise.resolve();
    },
    // The same steps the browser build takes, so the tests pin down what reset leaves behind.
    reset: () => {
      connection.close();
      db.dropFiles();
      db.reset();
      db.open({});
      connection = db.connect();
      return Promise.resolve();
    },
  };
}
