import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return url;
}

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * The shared Drizzle client. Created on first use so that importing a module that touches
 * the database never fails at build time, when no connection string exists.
 */
export function db() {
  instance ??= drizzle(new Pool({ connectionString: databaseUrl() }), { schema });
  return instance;
}
