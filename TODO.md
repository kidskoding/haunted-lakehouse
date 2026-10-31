# TODO

Work top to bottom. **Every numbered leaf item (for example 7.1.3) is exactly one commit.** Before each commit, run lint, typecheck, and tests (plus Playwright and a screenshot review for UI items), and tick the box in this file in the same commit. See CLAUDE.md §9.

---

## 0. Spikes (prove the risky parts first)

Spikes are throwaway experiments. Build them wherever is quickest outside the app, record the results and decisions in `docs/` (local-only), and land each spike item as a PR that only ticks its box. Spike code never enters the app.

- [x] **0.1 Vercel hello world.** A minimal Next.js app deployed to Vercel with one route handler. Record the account's plan limits (function duration, memory, bundle size) in `docs/decisions/0001-vercel-limits.md`.
- [x] **0.2 DuckDB-WASM in the browser.** A spike page that loads DuckDB-WASM in a Web Worker, ingests JSON, CSV, and Parquet fetched from a route handler, and runs a window-function query. Measure cold-load time and memory. Record the results.
- [x] **0.3 Server-side generation.** A route handler that generates about 2 MB of seeded JSON, CSV, and Parquet in TypeScript within Vercel's limits. Pick the Parquet writer library based on bundle size and correctness. Record the results.
- [x] **0.4 Delta log feasibility.** Generate a tiny Delta table's `_delta_log` (JSON commits plus a Parquet checkpoint) in TypeScript, then validate it by reading it with the `deltalake` Python package in a local script. Record the approach.
- [x] **0.5 Scene library.** Build the same small scene (a flickering candle plus a clock hand sweep) in Phaser and in PixiJS. Compare bundle size, performance, and dev experience, and pick one in `docs/decisions/0002-scene-library.md`.
- [x] **0.6 Spike review.** Summarize all spike results in `docs/decisions/0003-architecture.md`. **Stop and ask the repo owner to review before Phase 1.**

---

## 1. Foundation

### 1.1 Repo
- [x] **1.1.1 Scaffold.** Next.js App Router, TypeScript strict, Tailwind, bun, ESLint (typescript-eslint strict), Prettier, Vitest, and Playwright. MIT `LICENSE`, plus a placeholder `README.md` (title and tagline only).
- [x] **1.1.2 CI.** GitHub Actions running lint, typecheck, Vitest, and Playwright on push and PR.
- [x] **1.1.3 Vercel project.** Connect the GitHub repo to a Vercel project so every pushed branch gets a preview deployment and `main` deploys to production. Environment variables documented in `.env.example`.

### 1.2 Data and auth
- [ ] **1.2.1 Database.** Postgres via Vercel's marketplace integration, with Drizzle ORM and the initial schema: players, runs, run_events, unlocks, fragments, daily_results. Migrations committed.
  - [x] **1.2.1.1 Schema and migrations.** Drizzle ORM schema for players, runs, run_events, unlocks, fragments, and daily_results, with the initial migration committed and tested against Postgres.
  - [ ] **1.2.1.2 Provisioning.** Postgres from Vercel's marketplace connected to every environment, `DATABASE_URL` set, and the migrations applied.
- [x] **1.2.2 Anonymous sessions.** Players can start immediately with an anonymous signed session cookie.
- [ ] **1.2.3 GitHub sign-in.** Auth.js with GitHub OAuth. Signing in claims the anonymous player's progress.

---

## 2. Puzzle engine (server-only TypeScript)

### 2.1 Core
- [x] **2.1.1 Seeding.** A stable hash maps `(puzzle_id, run_seed, slot)` to a seeded PRNG, plus a human-friendly seed generator (`raven-pumpkin-13`). Tests cover stability, isolation, and the fact that no global randomness is used.
- [x] **2.1.2 Puzzle contract.** A `Puzzle` interface: id, slot, tier, title, prerequisites, retention, checkpoints, `generate(seed)` returning batches plus expected gold state per checkpoint, and narrative bindings. Pool registry keyed by slot.
- [x] **2.1.3 Canonical result hashing.** Sorts rows, applies defined numeric rounding and null encoding, and hashes. Identical results on DuckDB Node and DuckDB-WASM, tested with tricky values (floats, nulls, unicode, timestamps).

### 2.2 The Hollow Creek world
- [x] **2.2.1 Houses and kids.** Seeded `houses` and `trick_or_treaters` with realistic distributions. Include tests for determinism and distribution sanity.
- [x] **2.2.2 Door scans.** Routes through streets, with arrivals peaking 7–8pm. Local timestamps run 6pm to 3am across the DST fall-back. Each scan has a device ID and sequence number.
- [x] **2.2.3 Candy trades.** The Candy Co-op ledger, consistent with what kids collected.
- [x] **2.2.4 Hayride gates.** Tap-in and tap-out events. Kids on the hayride can't scan doors.
- [x] **2.2.5 Costume votes.** Ballots with edits and revisions, cast only by kids present that night.
- [x] **2.2.6 Pumpkin sensors.** Candle-flame readings with realistic flicker and burn-out.
- [x] **2.2.7 Porch lights and candy bowls.** Porch-light sensors that report state changes (some go silent), and candy-bowl scales that report weight, with per-candy-type weights and refills.
- [x] **2.2.8 Cross-feed consistency.** A test suite proving all feeds agree across 20 seeds.

### 2.3 Batches
- [x] **2.3.1 Batch scheduler.** Splits a feed into arrival-ordered batches with seeded injections: late arrivals, duplicates, out-of-order delivery, and schema drift. Each injection is declarative per puzzle.
- [x] **2.3.2 Visible vs hidden.** Marks batches as visible (preview) or hidden (run-the-night only), and a route handler serves hidden batches only for an active run-the-night attempt.

### 2.4 Runs and meta-progression
- [x] **2.4.1 Run state machine.** Slots, pool draws (respecting prerequisites), candles, boss rules, curses, relic offers and choices, and death. A pure reducer with exhaustive tests.
- [x] **2.4.2 Checkpoint validation API.** The client submits gold hashes per checkpoint; the server compares, records the attempt, and updates candles. Returns only the first failing checkpoint.
- [x] **2.4.3 Relics v1.** Wren's Lantern, Raven's Feather, Hourglass, Black Cat, and Spare Candle, implemented as engine effects with tests.
- [x] **2.4.4 Curses v1.** Possession, Fog, Short Memory, and Darkness, implemented as engine effects with tests.
- [ ] **2.4.5 Unlocks.** Act gating, characters, endings, and ledger fragments, persisted per player.

---

## 3. Pipeline runtime (client)

- [x] **3.1 Engine worker.** DuckDB-WASM in a Web Worker behind a typed message API, loaded in the background on page load, with progress reporting.
- [x] **3.2 Runtime contract doc.** `docs/pipeline-runtime.md` precisely specifies `view`, `table`, and `incremental` (`{{ this }}`, `{{ new_batch }}`, `unique_key`), bronze retention, checkpoints, and idempotency replays.
- [x] **3.3 Model compiler.** Parses model files, resolves references into a DAG, detects cycles with clear errors, and renders templated SQL.
- [x] **3.4 Night executor.** Replays batches in order, applies retention, runs models in DAG order per batch, and hashes gold at checkpoints. Supports preview mode and run-the-night mode.
- [x] **3.5 Failure reporting.** Identifies the first failing checkpoint and the batch that preceded it, and reveals that batch's data to the player.
- [x] **3.6 Shared semantics tests.** The executor runs under Vitest on DuckDB Node with the same results as in the browser. Include tests for every materialization and for retention.

---

## 4. Art direction and design system

- [x] **4.1 Art direction doc.** `docs/art-direction.md`: mood, palette (with contrast-checked tokens), typography (chosen typefaces and scale), iconography, motion principles, sound palette, and a wireframe of every screen. **Stop and ask the repo owner to review before 4.2.**
- [x] **4.2 Design tokens.** Colors, type scale, spacing, radii, shadows, and motion durations and easings as Tailwind theme tokens.
- [x] **4.3 Core components.** Button, panel, tabs, tooltip, dialog, toast, and kbd hint. Accessible, keyboard-complete, every state designed. A `/dev/components` gallery page covers them (excluded from production).
- [x] **4.4 Scene shell.** The chosen scene library mounted behind a React component, with a reduced-motion fallback and a lazy-loaded bundle.
- [ ] **4.5 Sound system.** Ambient loop and stings. Muted by default, one-click enable, volume persisted.

---

## 5. Screens

- [ ] **5.1 Landing.** Hollow Creek at dusk (scene), title, tagline, and an "Enter the night" button. Interactive in under 2s. Includes the Open Graph image.
- [ ] **5.2 Character select.** Locked and unlocked states, with candle counts and starting relics.

### 5.3 Run screen
- [ ] **5.3.1 Layout.** Resizable panels as specified in the art direction, with the layout persisted.
- [ ] **5.3.2 Top bar.** Candles, night clock with slot markers, seed, and act indicator.
- [ ] **5.3.3 Story panel.** Narrative rendering with typographic polish and character portraits or monograms.
- [ ] **5.3.4 Table browser.** Bronze sources with schema, row counts, and the batches seen so far.
- [ ] **5.3.5 Pipeline DAG.** Live graph of models, with clickable nodes that open their editor tab.
- [ ] **5.3.6 Editor.** CodeMirror 6 SQL with schema-aware autocomplete, per-model tabs, materialization picker, format, and shortcuts.
- [x] **5.3.7 Results grid.** Virtualized, resizable columns, copy-to-clipboard, and clear error display.
- [ ] **5.3.8 Relic bar and run buttons.** Relic tooltips and activation, Preview, and Run the night.

### 5.4 Moments
- [ ] **5.4.1 Run the night.** A timeline animation of batches landing, checkpoints passing or cracking, and the clock sweeping. Skippable.
- [ ] **5.4.2 Hour cleared.** Story beat, then the "What really happened" autopsy card, then the relic choice of two.
- [ ] **5.4.3 Candle lost.** Guttering animation, a character reaction, and the failing batch revealed.
- [ ] **5.4.4 Curse intro and boss intro.** Fog overlay and the dimmed boss presentation.
- [ ] **5.4.5 Death.** Fade to black and an engraved tombstone, with Rise again, Share, and Replay seed. Shareable tombstone image via OG image generation.
- [ ] **5.4.6 Endings.** Ending scenes and an act-unlock reveal.

### 5.5 The Crypt
- [ ] **5.5.1 Hub.** Navigation to the Codex, Graveyard, Ledger, Characters, and Daily Haunt.
- [ ] **5.5.2 Codex.** The player's earned autopsies.
- [ ] **5.5.3 Graveyard.** Recent tombstones across players, filterable, each replayable by seed.
- [ ] **5.5.4 Ledger.** Fragments collected and the torn pages filling in.
- [ ] **5.5.5 Daily Haunt.** Today's seed, one attempt, and a leaderboard.

- [ ] **5.6 Mobile.** Landing, Crypt, tombstones, and story are readable on phones, and the run screen shows a polished "best played on a laptop" message.

---

## 6. Story framework

- [x] **6.1 Story bible.** `docs/story.md` covers cast voices with sample lines, the full mystery, every ending, the fragment locations, and Wren's dialogue progression. **Stop and ask the repo owner to review.**
- [x] **6.2 Narrative engine.** Story intros, beats, autopsies, and character reactions are templated from the run's actual data, with a test that every puzzle renders with no unfilled placeholders.

---

## 7. Act I: Dusk (the first launch)

Every puzzle follows the same five steps:
1. **Design doc** in `docs/puzzles/`: the problem, the discovery step, the reasoning step, why the trap is tempting (see CLAUDE.md §4), data feeds, batches and injections, retention, checkpoints, expected gold definition, the trap pipeline and why it fails, the story beat, and the autopsy outline.
2. **Generator:** feeds, batches, and expected gold per checkpoint.
3. **Reference and trap pipelines with tests:** reference survives 20 seeds; trap fails 20 seeds.
4. **Narrative:** intro, story beat, character reactions, and autopsy.
5. **Playtest note:** a play-through on 3 seeds, with timing and difficulty notes added to `docs/playtest.md` and tuning applied.

### 7.1 Porch Lights (6:00pm, ★, tutorial)
*The Mayor wants to know how many houses are welcoming trick-or-treaters at each checkpoint. Porch-light sensors report changes, not states, and a few go silent. The tutorial teaches the editor, models, preview, and running the night. Trap: counting lights that were ever switched on.*
- [x] **7.1.1** Design doc
- [x] **7.1.2** Generator
- [x] **7.1.3** Reference and trap pipelines with tests
- [x] **7.1.4** Narrative, including tutorial callouts
- [ ] **7.1.5** Playtest note

### 7.2 The Thirteenth Door (6:45pm, ★★)
*Houses that gave out exactly 13 pieces before 7pm are cursed, but nothing counts pieces. Candy bowls report weight, candy types weigh differently, and bowls get refilled. Gold: the street with the most cursed houses. Trap: counting door scans as pieces, or treating refills as negative giving.*
- [x] **7.2.1** Design doc
- [x] **7.2.2** Generator
- [x] **7.2.3** Reference and trap pipelines with tests
- [x] **7.2.4** Narrative
- [ ] **7.2.5** Playtest note

### 7.3 The Possessed Feed (7:30pm, ★★, Act I boss)
*The decorations vendor's feed renames, retypes (`"lots"` in an integer column), and reorders columns mid-night. Gold must keep the possessed rows by recovering their values. Trap: dropping or nulling malformed rows.*
- [x] **7.3.1** Design doc
- [x] **7.3.2** Generator
- [x] **7.3.3** Reference and trap pipelines with tests
- [x] **7.3.4** Narrative, including the Act I ending
- [ ] **7.3.5** Playtest note

### 7.4 Act I release
- [ ] **7.4.1 End-to-end tests.** Playwright plays a full Act I run, a death, and a Crypt visit on 3 seeds.
- [ ] **7.4.2 Quality pass.** Lighthouse 90+ and zero axe violations on every page, screenshot review at all widths, and fixes applied.
- [ ] **7.4.3 Hallowed Night seed.** Event seed configuration, released at 6pm Central on Oct 31.
- [ ] **7.4.4 README.** Hook, a screenshot or GIF, a "Play now" link, how it works, the stack, how to run locally, and an Act I puzzle list (no spoilers).
- [ ] **7.4.5 Production deploy and tag v0.1.0.**

---

## 8. Act II: Night

### 8.1 The Hall of Mirrors (8:15pm, ★★★)
*The costume-contest leaderboard double-counts because votes are joined to ballot revisions. Gold: the true standings. Trap: aggregating at the wrong grain.*
- [ ] **8.1.1** Design doc
- [ ] **8.1.2** Generator
- [ ] **8.1.3** Reference and trap pipelines with tests
- [ ] **8.1.4** Narrative
- [ ] **8.1.5** Playtest note

### 8.2 The Wandering Ghost (9:00pm, ★★★)
*Door scans arrive in batches with duplicates and resends. One "kid" moves between houses faster than anyone could walk. Gold: the ghost's costume, at each checkpoint. Trap: dedup without sequence numbers, or comparing scans across kids.*
- [ ] **8.2.1** Design doc
- [ ] **8.2.2** Generator
- [ ] **8.2.3** Reference and trap pipelines with tests
- [ ] **8.2.4** Narrative
- [ ] **8.2.5** Playtest note

### 8.3 The Changeling (9:45pm, ★★★)
*The Mayor's and Marisol's dashboards disagree on "active houses." The town charter (in the story) defines it. Gold: the charter's metric, maintained incrementally. Trap: the more intuitive definition.*
- [ ] **8.3.1** Design doc
- [ ] **8.3.2** Generator
- [ ] **8.3.3** Reference and trap pipelines with tests
- [ ] **8.3.4** Narrative
- [ ] **8.3.5** Playtest note

### 8.4 The Graveyard Shift (10:30pm, ★★★★, Act II boss)
*Pumpkin sensor readings arrive late and duplicated, with short bronze retention. Gold: per-window flame-out counts, finalized by the story's lateness rule at each checkpoint. Trap: no finalization rule, or dedup that forgets across batches.*
- [ ] **8.4.1** Design doc
- [ ] **8.4.2** Generator
- [ ] **8.4.3** Reference and trap pipelines with tests
- [ ] **8.4.4** Narrative, including the Act II ending
- [ ] **8.4.5** Playtest note

### 8.5 Act II release
- [ ] **8.5.1** End-to-end tests and quality pass for Act II
- [ ] **8.5.2** README update, production deploy, and tag v0.2.0

---

## 9. Act III: The Witching Hour

### 9.1 The Candy Co-op (11:15pm, ★★★★)
*Marisol's ledger and the door scans disagree on how much candy moved. CDC trades arrive out of order with duplicate keys in the same batch. Gold: an SCD Type 2 holdings table, checked by point-in-time questions at checkpoints. Red herring: the dentist legitimately gives out about 3x average. Trap: merging without per-key ordering.*
- [ ] **9.1.1** Design doc
- [ ] **9.1.2** Generator
- [ ] **9.1.3** Reference and trap pipelines with tests
- [ ] **9.1.4** Narrative
- [ ] **9.1.5** Playtest note

### 9.2 The Witching Hour (1:00am, twice, ★★★★★)
*The clocks fall back. Building on slot 8's SCD2, gold answers questions inside the repeated hour, and the game replays a batch to check idempotency. Trap: naive local timestamps, or non-idempotent appends.*
- [ ] **9.2.1** Design doc
- [ ] **9.2.2** Generator
- [ ] **9.2.3** Reference and trap pipelines with tests
- [ ] **9.2.4** Narrative
- [ ] **9.2.5** Playtest note

### 9.3 The Séance (2:00am, ★★★★★, final boss)
*The original ledger was dropped and vacuumed. The player gets the raw `_delta_log` (JSON commits plus a checkpoint) and the surviving Parquet files, and builds a pipeline that replays the log to find the latest fully reconstructable version. Traps: trusting the latest version (missing files), or reading every Parquet file (tombstoned data). The design doc cites the Delta protocol sections used.*
- [ ] **9.3.1** Design doc
- [ ] **9.3.2** Generator (Delta log validated against the `deltalake` reader per spike 0.4)
- [ ] **9.3.3** Reference and trap pipelines with tests
- [ ] **9.3.4** Narrative, including the endings and the true ending
- [ ] **9.3.5** Playtest note

### 9.4 v1.0 release
- [ ] **9.4.1** End-to-end tests and quality pass for the full game
- [ ] **9.4.2** `CONTRIBUTING.md`: how to propose and build a new puzzle for a slot's pool
- [ ] **9.4.3** README update, production deploy, and tag v1.0.0

---

## 10. After v1.0

- [ ] **10.1 Pool variants.** A second puzzle for each slot, so runs diverge.
- [ ] **10.2 Export your pipeline.** Download your run's models and data as a project that runs on Databricks Free Edition, dbt, or plain DuckDB.
