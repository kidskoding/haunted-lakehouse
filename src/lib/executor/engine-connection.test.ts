import { describe, expect, it } from "vitest";
import { EngineError } from "../engine/client";
import type { QueryResult } from "../engine/protocol";
import { engineConnection } from "./engine-connection";

describe("engineConnection", () => {
  it("runs statements as exec requests and queries as query requests", async () => {
    const sent: string[] = [];
    const result: QueryResult = {
      columns: [
        { name: "kid", type: "Utf8" },
        { name: "n", type: "Int64" },
      ],
      rows: [["a", 1n]],
    };
    const connection = engineConnection({
      exec: (sql) => {
        sent.push(`exec ${sql}`);
        return Promise.resolve(null);
      },
      query: (sql) => {
        sent.push(`query ${sql}`);
        return Promise.resolve(result);
      },
    });
    await connection.run("CREATE SCHEMA silver");
    expect(await connection.query("SELECT kid, n FROM t")).toEqual({
      columns: ["kid", "n"],
      rows: [["a", 1n]],
    });
    expect(sent).toEqual(["exec CREATE SCHEMA silver", "query SELECT kid, n FROM t"]);
  });

  it("rejects with DuckDB's message unchanged, so positions still map onto the model", async () => {
    const message =
      'Binder Error: Referenced column "nope" not found\n\nLINE 2:   nope\n          ^';
    const connection = engineConnection({
      exec: () => Promise.reject(new EngineError("sql", message)),
      query: () => Promise.reject(new EngineError("sql", message)),
    });
    await expect(connection.run("SELECT nope")).rejects.toThrow(message);
    await expect(connection.query("SELECT nope")).rejects.toThrow(message);
  });
});
