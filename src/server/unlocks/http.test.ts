import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { fragments, players } from "../db/schema";
import { currentPlayerId } from "../session/session";
import { handleGrantFragment } from "./http";

vi.mock("../session/session", () => ({ currentPlayerId: vi.fn() }));
vi.mock("../db/client", () => ({ db: vi.fn() }));

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/unlocks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("handleGrantFragment", () => {
  let database: Awaited<ReturnType<typeof freshDb>>;

  beforeEach(async () => {
    database = await freshDb();
    vi.mocked(db).mockResolvedValue(database);
  });

  it("grants a page to a player who has only a session cookie so far", async () => {
    const playerId = crypto.randomUUID();
    vi.mocked(currentPlayerId).mockResolvedValue(playerId);

    const response = await handleGrantFragment(post({ fragmentId: "page-1" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ granted: true, fragmentId: "page-1" });
    expect(await database.select().from(players).where(eq(players.id, playerId))).toHaveLength(1);
    expect(
      await database.select().from(fragments).where(eq(fragments.playerId, playerId)),
    ).toHaveLength(1);
  });
});
