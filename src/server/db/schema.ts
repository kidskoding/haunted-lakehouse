import {
  bigint,
  date,
  foreignKey,
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
    // Targets of the composite foreign keys that tie fragments and daily results to the
    // player's own runs.
    unique("runs_id_player_key").on(t.id, t.playerId),
    unique("runs_id_player_daily_date_key").on(t.id, t.playerId, t.dailyDate),
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
    // The run that found the fragment. Optional: fragments persist across runs by design.
    runId: uuid("run_id"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.fragmentId] }),
    // The finding run must be this player's own. Deleting the run must clear only run_id,
    // so the migration narrows this to Postgres 15's `ON DELETE SET NULL ("run_id")`,
    // which Drizzle cannot express; a plain SET NULL would also null player_id and fail.
    foreignKey({
      name: "fragments_run_fk",
      columns: [t.runId, t.playerId],
      foreignColumns: [runs.id, runs.playerId],
    }).onDelete("set null"),
  ],
);

export const dailyResults = pgTable(
  "daily_results",
  {
    dailyDate: date("daily_date").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().unique(),
    slotsCleared: smallint("slots_cleared").notNull(),
    candlesLeft: smallint("candles_left").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.dailyDate, t.playerId] }),
    // A result must come from this player's own Daily Haunt run for this date. Non-daily
    // runs have a null daily_date, so they can never match.
    foreignKey({
      name: "daily_results_run_fk",
      columns: [t.runId, t.playerId, t.dailyDate],
      foreignColumns: [runs.id, runs.playerId, runs.dailyDate],
    }).onDelete("cascade"),
    index("daily_results_leaderboard_idx").on(
      t.dailyDate,
      t.slotsCleared.desc(),
      t.candlesLeft.desc(),
    ),
  ],
);
