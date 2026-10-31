import { EngineClient, type WorkerPort } from "../engine/client";
import { createEngineHost } from "../engine/host";
import { wasmDatabase } from "../engine/testing/wasm-duckdb";
import type { SqlConnection } from "./connection";
import { engineConnection } from "./engine-connection";
import { nativeConnection } from "./test-connection";

/**
 * The engine worker's host run in this thread. Messages are structured-cloned both ways, as
 * `postMessage` would, so the executor talks to DuckDB-WASM through the same protocol the
 * browser uses; only the thread boundary is missing.
 */
class InProcessWorker implements WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly #handle = createEngineHost(wasmDatabase, (message) => {
    this.onmessage?.(new MessageEvent("message", { data: structuredClone(message) }));
  });

  readonly postMessage = (message: unknown): void => {
    this.#handle(structuredClone(message));
  };

  readonly terminate = (): void => undefined;
}

export interface TestEngine {
  readonly name: "native" | "wasm";
  /** A connection to a fresh, empty database. Earlier connections must no longer be used. */
  readonly connect: () => Promise<SqlConnection>;
}

// One WASM instance for the whole run, emptied before each use: instantiating it costs about
// a second, and resetting it gives a fresh database just as the browser's engine does.
let client: EngineClient | null = null;

/** Native DuckDB, and DuckDB-WASM behind the engine worker's protocol. */
export const ENGINES: readonly TestEngine[] = [
  { name: "native", connect: nativeConnection },
  {
    name: "wasm",
    connect: async () => {
      client ??= new EngineClient(() => new InProcessWorker());
      await client.reset();
      return engineConnection(client);
    },
  },
];
