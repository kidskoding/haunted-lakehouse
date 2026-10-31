"use client";

import { useEffect, useState } from "react";
import { EngineError, type EngineClient } from "./client";

/** The query parameter that runs the self-test. */
const PARAM = "engine-selftest";

const CSV = "house,lights\nMaple,on\nWillow,off\n";

/**
 * Drives every engine call once against the real worker and reports what came back. The
 * end-to-end suite has no other way into the page's engine without a global, and the
 * provider renders this only outside production builds.
 */
async function selfTest(client: EngineClient): Promise<unknown> {
  await client.registerFile("porch.csv", new TextEncoder().encode(CSV));
  await client.exec(
    "CREATE TABLE porch AS SELECT * FROM read_csv('porch.csv'); CREATE TABLE answer AS SELECT 42 AS n",
  );
  const query = await client.query(
    "SELECT n, TIMESTAMP '2026-10-31 18:00:00' AS at, 12.50::DECIMAL(6, 2) AS bowl FROM answer",
  );
  const canonical = await client.canonicalRead("porch");
  const sqlError = await errorCode(client.query("SELECT * FROM missing_table"));
  await client.reset();
  const afterReset = await client.query("SELECT count(*) AS n FROM duckdb_tables()");
  const fileAfterReset = await errorCode(client.query("SELECT * FROM read_csv('porch.csv')"));
  return {
    query: {
      columns: query.columns.map((c) => c.name),
      rows: query.rows.map((r) => r.map(String)),
    },
    canonical,
    sqlError,
    tablesAfterReset: afterReset.rows.map((r) => r.map(String)),
    fileAfterReset,
  };
}

/** The code a call failed with, or null if it succeeded. */
function errorCode(call: Promise<unknown>): Promise<string | null> {
  return call.then(
    () => null,
    (error: unknown) => (error instanceof EngineError ? error.code : "unexpected"),
  );
}

// Module scope so React's development double-run of effects cannot start a second pass.
let run: Promise<unknown> | null = null;

export function EngineSelfTest({ client }: Readonly<{ client: EngineClient }>) {
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PARAM)) return;
    let live = true;
    run ??= selfTest(client);
    run.then(
      (result) => {
        if (live) setReport(JSON.stringify({ ok: true, result }));
      },
      (error: unknown) => {
        if (live) setReport(JSON.stringify({ ok: false, error: String(error) }));
      },
    );
    return () => {
      live = false;
    };
  }, [client]);

  return report === null ? null : <output hidden data-engine-selftest={report} />;
}
