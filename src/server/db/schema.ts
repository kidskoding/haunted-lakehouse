import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const playerCharacter = pgEnum("player_character", [
  "intern",
  "night_clerk",
  "purist",
  "old_wren",
]);

export const runStatus = pgEnum("run_status", ["active", "survived", "dead", "abandoned"]);

export const unlockKind = pgEnum("unlock_kind", ["act", "character", "ending"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * A player starts anonymous and gains a GitHub identity on sign-in, so the row (and every
 * run, unlock, and fragment hanging off it) survives the claim unchanged.
 */
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: bigint("github_id", { mode: "number" }).unique(),
  githubLogin: text("github_login"),
  createdAt: createdAt(),
});

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    seed: text("seed").notNull(),
    character: playerCharacter("character").notNull(),
    status: runStatus("status").notNull().default("active"),
    // Set only for Daily Haunt runs; the unique constraint below enforces one attempt per day.
    dailyDate: date("daily_date"),
    createdAt: createdAt(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_player_id_idx").on(t.playerId),
    unique("runs_player_daily_date_key").on(t.playerId, t.dailyDate),
  ],
);

/**
 * The run's append-only history. Run state is derived by folding these events, so the
 * per-run sequence number is what orders them, never the timestamp.
 */
export const runEvents = pgTable(
  "run_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("run_events_run_id_seq_key").on(t.runId, t.seq)],
);

export const unlocks = pgTable(
  "unlocks",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: unlockKind("kind").notNull(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.kind, t.key] })],
);

export const fragments = pgTable(
  "fragments",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    fragmentId: text("fragment_id").notNull(),
    // Kept when the run is gone: the fragment persists across runs by design.
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.fragmentId] })],
);

export const dailyResults = pgTable(
  "daily_results",
  {
    dailyDate: date("daily_date").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .unique()
      .references(() => runs.id, { onDelete: "cascade" }),
    slotsCleared: smallint("slots_cleared").notNull(),
    candlesLeft: smallint("candles_left").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.dailyDate, t.playerId] }),
    index("daily_results_leaderboard_idx").on(
      t.dailyDate,
      t.slotsCleared.desc(),
      t.candlesLeft.desc(),
    ),
  ],
);
