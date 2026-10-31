CREATE TYPE "public"."player_character" AS ENUM('intern', 'night_clerk', 'purist', 'old_wren');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('active', 'survived', 'dead', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."unlock_kind" AS ENUM('act', 'character', 'ending');--> statement-breakpoint
CREATE TABLE "daily_results" (
	"daily_date" date NOT NULL,
	"player_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"slots_cleared" smallint NOT NULL,
	"candles_left" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_results_daily_date_player_id_pk" PRIMARY KEY("daily_date","player_id"),
	CONSTRAINT "daily_results_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "fragments" (
	"player_id" uuid NOT NULL,
	"fragment_id" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fragments_player_id_fragment_id_pk" PRIMARY KEY("player_id","fragment_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint,
	"github_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "run_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_events_run_id_seq_key" UNIQUE("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"character" "player_character" NOT NULL,
	"status" "run_status" DEFAULT 'active' NOT NULL,
	"daily_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "runs_player_daily_date_key" UNIQUE("player_id","daily_date"),
	CONSTRAINT "runs_id_player_daily_date_key" UNIQUE("id","player_id","daily_date")
);
--> statement-breakpoint
CREATE TABLE "unlocks" (
	"player_id" uuid NOT NULL,
	"kind" "unlock_kind" NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unlocks_player_id_kind_key_pk" PRIMARY KEY("player_id","kind","key")
);
--> statement-breakpoint
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_run_fk" FOREIGN KEY ("run_id","player_id","daily_date") REFERENCES "public"."runs"("id","player_id","daily_date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_results_leaderboard_idx" ON "daily_results" USING btree ("daily_date","slots_cleared" DESC NULLS LAST,"candles_left" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_player_id_idx" ON "runs" USING btree ("player_id");