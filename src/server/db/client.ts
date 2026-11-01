import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

/** Either Postgres driver the app binds to the schema: `pg` in production, PGlite locally. */
export type RunDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

/** An open transaction on either driver. */
export type RunTransaction = Parameters<Parameters<RunDatabase["transaction"]>[0]>[0];

/** Where a read or write runs: straight on the database, or inside a transaction. */
export type RunExecutor = RunDatabase | RunTransaction;

export type DatabaseTarget =
  | { readonly kind: "postgres"; readonly url: string }
  | { readonly kind: "pglite"; readonly dataDir: string };

/**
 * Which database a process talks to. Production, Vercel previews included, uses the Postgres
 * pool on `DATABASE_URL`. Everything else (dev, CI, tests) uses a local PGlite directory and
 * ignores `DATABASE_URL`, so a connection string pulled from Vercel never takes dev writes.
 */
export function databaseTarget(env: {
  readonly NODE_ENV?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
}): DatabaseTarget {
  if (env.NODE_ENV !== "production") {
    return { kind: "pglite", dataDir: join(process.cwd(), ".data", "pglite") };
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return { kind: "postgres", url: env.DATABASE_URL };
}

async function openLocal(dataDir: string): Promise<RunDatabase> {
  const [{ PGlite }, { drizzle: drizzleLite }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  mkdirSync(dataDir, { recursive: true });
  const database = drizzleLite(new PGlite(dataDir), { schema });
  // Applied migrations are recorded in the directory, so later opens only apply new ones.
  await migrate(database, { migrationsFolder: join(process.cwd(), "drizzle") });
  return database;
}

async function open(target: DatabaseTarget): Promise<RunDatabase> {
  if (target.kind === "postgres") {
    return drizzle(new Pool({ connectionString: target.url }), { schema });
  }
  // Next inlines NODE_ENV, so production bundles drop the PGlite import below entirely.
  if (process.env.NODE_ENV === "production") throw new Error("PGlite is for local use only.");
  return openLocal(target.dataDir);
}

// Dev reloads re-evaluate this module; two PGlite instances on one directory would corrupt it.
const cache = globalThis as typeof globalThis & { __hauntedDatabase?: Promise<RunDatabase> };

/**
 * The shared Drizzle client. Opened on first use so that importing a module that touches the
 * database never fails at build time, when no connection string exists.
 */
export function db(): Promise<RunDatabase> {
  cache.__hauntedDatabase ??= open(databaseTarget(process.env));
  return cache.__hauntedDatabase;
}
