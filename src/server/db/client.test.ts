import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { databaseTarget } from "./client";

const NEON = "postgres://someone@ep-shared.neon.tech/neondb";
const LOCAL = { kind: "pglite", dataDir: join(process.cwd(), ".data", "pglite") };

describe("databaseTarget", () => {
  it("uses the Postgres pool in production", () => {
    expect(databaseTarget({ NODE_ENV: "production", DATABASE_URL: NEON })).toEqual({
      kind: "postgres",
      url: NEON,
    });
  });

  it("refuses production without a connection string", () => {
    expect(() => databaseTarget({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it.each(["development", "test", undefined])(
    "keeps %s on local PGlite, ignoring a pulled DATABASE_URL",
    (NODE_ENV) => {
      expect(databaseTarget({ NODE_ENV, DATABASE_URL: NEON })).toEqual(LOCAL);
    },
  );
});
