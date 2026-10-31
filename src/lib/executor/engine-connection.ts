import type { QueryResult } from "../engine/protocol";
import type { SqlConnection } from "./connection";

/** The engine requests the executor runs on, as `EngineClient` offers them. */
export interface EngineRequests {
  exec(sql: string): Promise<null>;
  query(sql: string): Promise<QueryResult>;
}

/**
 * The executor's connection on the engine worker (DuckDB-WASM), through its message protocol.
 * A rejected request keeps DuckDB's message as its own, so positioned errors map back onto a
 * model's SQL exactly as they do on native DuckDB.
 */
export function engineConnection(engine: EngineRequests): SqlConnection {
  return {
    run: async (sql) => {
      await engine.exec(sql);
    },
    query: async (sql) => {
      const result = await engine.query(sql);
      return { columns: result.columns.map((column) => column.name), rows: result.rows };
    },
  };
}
