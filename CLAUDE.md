@AGENTS.md

# Haunted Lakehouse

Agent workflow (branches, commits, merge loop, stop-and-ask rules) lives in `AGENTS.md`. This file is the product bible.

**A roguelike where your data pipeline has to survive Halloween night.**

A browser game for data engineers. Each run is one Halloween night in the town of Hollow Creek, from 6pm to 3am. Raw data lands batch by batch. You build a bronze → silver → gold pipeline in the browser, and the game replays the night through it: late events, duplicates, schema changes, out-of-order CDC, and the 1am hour happening twice. Survive and the night goes on. Break and a candle goes out.

Deployed on Vercel. Playable instantly from a link: no install, no account needed to start.

---

## 1. The spirit

**North star: reason first, then apply data engineering.** Every puzzle asks the player to understand a messy situation, work out what's really going on, decide what the right answer even means, and only then build the pipeline that produces it. The thinking is the game; the SQL is how you express it. When a design choice is unclear, pick whichever makes the player reason more.

**Advent of Code's soul, not its format.** Every puzzle is a small story, the story is the spec, every player gets their own data, and the joy is the "aha." Do **not** copy AoC's structure: no Part 1 / Part 2, no stars, no daily calendar, no reused phrasing or mechanics.

**The Binding of Isaac's replayability.** Procedural runs, permadeath, relics that combine, curses, unlocks that reveal the story over many runs, multiple endings, seeds, and daily runs.

**Real data engineering.** The answer is never a single number you can grind out with one clever query. It's a pipeline that has to behave correctly as data arrives over time: incremental processing, idempotency, late data, CDC, schema evolution, and transaction logs. Every concept transfers directly to Databricks, Snowflake, dbt, or any production stack. No platform-specific features.

---

## 2. The core mechanic: run the night

Each hour of the night is one puzzle.

1. **Read.** The story panel delivers the hour's problem in a character's voice. Incident puzzles describe symptoms ("two numbers disagree"); analytic puzzles ask a question about the town. The text never names the bug or the technique.
2. **Explore.** The first batches of raw data are already in `bronze`. Query them freely in the editor.
3. **Build.** Write SQL models. Each model is a file in the pipeline, the DAG updates as models reference each other, and `gold.<name>` models are what gets checked.
4. **Preview.** Runs the pipeline over the visible batches. It's free: iterate as much as you like.
5. **Run the night.** The game replays the hour from the start, batch by batch, including **hidden batches** the player hasn't seen. At **checkpoints** (the Mayor checking a dashboard at 7:00pm, say), gold tables are compared to the expected state given only the data that had arrived by then.
   - **Survive:** the hour is cleared.
   - **Break:** a candle goes out, the timeline freezes on the first checkpoint that failed, and that batch's data becomes visible. The player learns *where* it broke, never *why*.

### Pipeline runtime contract

This contract is the heart of the game. Specify it precisely in `docs/pipeline-runtime.md` and keep it stable.

- Models are SQL `select` statements run on DuckDB (in the browser via DuckDB-WASM).
- Each model declares a materialization:
  - `view`: recomputed on read.
  - `table`: rebuilt in full after every batch.
  - `incremental`: on each batch, the model sees `{{ new_batch }}` (rows that arrived in this batch for each source) and `{{ this }}` (its own current state), and returns rows to merge on a declared `unique_key`, or to append if there is none.
- **Bronze retention:** raw feeds keep only the last *N* batches (stated per hour in the story, like a message queue's retention). Older raw data is gone. This is what forces genuinely incremental thinking: you can't full-refresh your way out of late data or deduplication.
- **Idempotency check** (Act III): the game replays a batch twice. Correct pipelines produce identical output.
- Gold output is compared by a **canonical hash** of the sorted rows, with defined rounding and null handling, so the comparison is exact and engine-independent.

---

## 3. Runs (the Isaac layer)

- A run descends the night hour by hour. Each hour is a **slot** with a fixed difficulty tier, so the ramp is always preserved. Each slot draws one puzzle from its **pool**.
- **Your pipeline persists through the run.** Later hours add new feeds and needs on top of what you've built, so by 2am you're running a real multi-stage pipeline you built piece by piece.
- **Candles:** 3 per run by default (varies by character). Failing "Run the night" costs 1, or 2 on a boss. At 0, the run ends.
- **Relics:** after clearing an hour, choose one of two. Relics give **engineering intel, never answers**, and they should combine in interesting ways.
  - **Wren's Lantern:** reveals the schema history of one feed.
  - **The Raven's Feather:** peek at one hidden batch before running the night.
  - **The Hourglass:** shows the expected row count of one gold table at the next checkpoint.
  - **The Black Cat:** skip one non-boss hour (no autopsy, no fragment).
  - **Spare Candle:** +1 candle.
- **Curses** can open an hour, making it harder and improving the next relic drop:
  - **Curse of Possession:** the feed's schema will drift during the night.
  - **Curse of the Fog:** the story withholds the symptom numbers.
  - **Curse of Short Memory:** bronze retention drops to one batch.
  - **Curse of Darkness:** relics can't be used this hour.
- **Characters**, unlocked through play:
  - **The Intern** (starter): 4 candles, starts with Wren's Lantern.
  - **The Night Clerk:** 3 candles, one extra relic choice per hour.
  - **The Purist:** 3 candles, `table` materialization disabled, so incremental only.
  - **Old Wren:** 1 candle, no relics. Unlocked by the true ending.
- **Unlocks:**
  - A new player's runs end at the Act I boss (7:30pm). The first win there opens Act II, and the first Act II boss win opens Act III.
  - Each boss gives an ending that reveals more of the mystery.
  - **Ledger fragments** are hidden in some puzzles' data. They're optional, persist across runs, and together unlock the **true ending**.
- **The Crypt** (hub between runs): the **Codex** (every autopsy earned), the **Graveyard** (tombstones, replayable by seed), the **Ledger** (fragments), **Characters**, and the **Daily Haunt**.
- **Seeds:** every run has a human-friendly seed (`raven-pumpkin-13`). The **Daily Haunt** is a date-derived shared seed with one attempt and a leaderboard. **Hallowed Night** is the Oct 31 event seed, released at 6pm Central.

---

## 4. The night

| Slot | Time | Tier | Launch puzzle | What the player has to figure out | Concepts underneath (never shown to the player) |
|---|---|---|---|---|---|
| 1 | 6:00pm | ★ | Porch Lights | Porch lights report state changes, not states. What was actually on at the checkpoint, given a few sensors that went silent? | event logs vs state, last-known-value (doubles as the tutorial) |
| 2 | 6:45pm | ★★ | The Thirteenth Door | Houses are cursed if they gave out exactly 13 pieces, but nothing counts pieces. Bowls report weight, candy types weigh differently, and bowls get refilled. Work out pieces given. | deriving a measure from indirect signals, deltas, refill detection |
| 3 | 7:30pm | ★★ **Act I boss** | The Possessed Feed | The vendor's feed changes shape mid-night, without warning. Some "broken" values are recoverable and some genuinely aren't; tell them apart and keep everything you can. | schema drift, type coercion, rescued values |
| 4 | 8:15pm | ★★★ | The Hall of Mirrors | The costume contest has a clear winner, and it's wrong. Figure out why the leaderboard lies and who actually won. | data grain, join fan-out |
| 5 | 9:00pm | ★★★ | The Wandering Ghost | One "kid" is somewhere they can't be. Find it, despite resent scans, drifting scanner clocks, and kids who share costumes. | dedup, sequencing, clock skew, entity resolution |
| 6 | 9:45pm | ★★★ | The Changeling | Two trusted dashboards disagree, and both are internally right. Read the town charter, decide what the number actually means, and build it. | metric definitions, specs as source of truth |
| 7 | 10:30pm | ★★★★ **Act II boss** | The Graveyard Shift | Pumpkin readings straggle in late and twice. The Mayor wants final numbers on the hour, and bronze forgets fast. When can you call a window finished? | late data, dedup across batches, finalization rules |
| 8 | 11:15pm | ★★★★ | The Candy Co-op | Marisol's ledger and the door scans disagree. Reconstruct who held what, and when, from a trade feed that arrives out of order. | CDC, merge ordering, SCD Type 2 |
| 9 | 1:00am (twice) | ★★★★★ | The Witching Hour | It's 1:00am again. Questions about "1:30am" now have two answers, and the night replays a batch to see if your pipeline flinches. | DST fall-back, idempotency |
| 10 | 2:00am | ★★★★★ **Final boss** | The Séance | The town's ledger was destroyed years ago. All that's left is its diary and some scattered pages. Bring it back, as it truly was. | Delta transaction log replay, tombstones, vacuumed files |

### Puzzle design: problems, not exercises

Every puzzle must be **real problem solving**, not "apply technique X." A puzzle that a player can solve by recognizing a keyword and reaching for the matching SQL function is a failed puzzle. Each one must pass all of these:

1. **The problem is stated in the town's terms, never in technical terms.** "Which houses are cursed?", never "use a window function to..."
2. **There's a discovery step.** The data hides something the player has to notice by exploring: a signal that isn't what it seems, a feed that misbehaves, a field that means something subtly different from its name.
3. **There's a reasoning step.** After noticing it, the player has to work out *what to do about it*, and more than one approach looks plausible. Usually only one is correct, and the story contains the clue that decides it.
4. **Concepts combine.** From Act II onward, no puzzle is solvable with a single technique. The hard part is seeing how two or three ideas interact.
5. **The trap is reasonable.** The trap pipeline is what a smart but hurried engineer would write, not a strawman. Falling into it should feel fair in hindsight.
6. **The autopsy is the payoff.** Once solved, the "What really happened" card names the concepts and connects them to real incidents. That's the only place technique names appear.

Every design doc must state its discovery step, its reasoning step, and why the trap is tempting. If a design doc can't, the puzzle isn't ready.

- **Acts:** I = Dusk (1–3), II = Night (4–7), III = The Witching Hour (8–10).
- The engine treats every slot as a pool from day one, even with one puzzle at launch. Adding a variant must never require engine changes.
- Puzzles with prerequisites (slot 9 needs slot 8's tables) only appear when the prerequisite was played earlier in the same run.

---

## 5. Story

**Hollow Creek** runs its whole Halloween on one lakehouse. The player is the new on-call data engineer, hired that afternoon. As the night goes on, the data gets stranger. Something is in the lakehouse.

**Cast** (consistent voices, defined in `docs/story.md`):
- **The Mayor:** pompous, impatient, wants numbers, never wants to know why.
- **Old Wren, the Groundskeeper:** ex-DBA, dry and cryptic. Her lines change as the player unlocks more of the story.
- **Marisol, the Candy Co-op Treasurer:** meticulous, anxious, convinced someone is stealing.
- **The Hollow:** the presence in the lakehouse. It speaks only through anomalies in the data, and later through ledger fragments.

**The mystery:** Years ago, the town's original ledger, a Delta table holding every Halloween since the town began, was dropped and vacuumed in a botched migration. Wren ran the `VACUUM`. The Hollow is that table's ghost: tombstoned files, an orphaned log, a history the town forgot. It's revealed across runs, through endings, fragments, and Wren's dialogue. Early runs only hint.

**Every cleared hour** shows a story beat, then a **"What really happened"** autopsy: a short, technically accurate explanation of the real-world version of the bug and how production teams prevent it.

**Writing bar:** tight, atmospheric, funny where it fits, specific. No filler, no generic AI-sounding prose. Every number in story text is rendered from the player's actual data.

---

## 6. UI and UX: the bar is "really, really nice"

The UI is half the product. It should feel like a crafted indie game, not a dashboard with a Halloween theme.

**Design skills (required):** for any design or UI work (the art direction doc, tokens, components, screens, moments, polish), consult the `design-taste-frontend` skill before designing and the `impeccable` skill to critique and audit the result before the TODO item is ticked.

**Art direction** (defined in `docs/art-direction.md` before any screen is built):
- Dark, warm, and atmospheric: candlelight amber against deep blue-black night, with restrained use of a single sickly-green accent for the Hollow.
- Typography: a characterful display face for story and titles, a highly readable sans for UI, and a quality monospace for code. Tune sizes and line lengths for long reading.
- Motion with meaning: the clock sweeping, candles guttering, batches landing on the timeline, fog creeping in for curses. Respect `prefers-reduced-motion` with calm equivalents.
- Sound: subtle ambient night audio and a few signature stings (candle out, hour cleared, death). Muted by default, one click to enable, volume remembered.

**Layout:** see the main run screen in `docs/art-direction.md`. Story and table browser on the left; DAG, editor, and results on the right; candles, clock, and seed on top; relics and the two run buttons at the bottom. Panels are resizable, and the layout is remembered.

**Craft requirements:**
- The editor is a first-class code editor: SQL syntax highlighting, autocomplete for tables and columns from the live schema, format-on-demand, keyboard shortcuts (run preview, run the night), and per-model tabs.
- The results grid handles large results with virtualized scrolling, column resizing, and copy-to-clipboard.
- Every state is designed: empty, loading, error, success, failure, first-time. No unstyled defaults anywhere.
- Fully keyboard-navigable, with visible focus, sensible ARIA, and WCAG AA contrast.
- Desktop-first (1280px and up) for play. Mobile shows the landing page, the Crypt, tombstones, and story, with a clear "best played on a laptop" message on the run screen.
- **Performance:** the landing page is interactive in under 2s on a mid-range laptop. The DuckDB engine loads in a Web Worker in the background while the player reads the intro, so it never blocks the UI.
- **Share moments:** tombstones and endings render as polished images (Open Graph cards) suitable for LinkedIn.

**Verification:** every screen gets Playwright screenshots at 1280, 1440, and 1920 widths, reviewed against the art direction before its TODO item is ticked. Run Lighthouse and axe on every page.

---

## 7. Tech stack

Everything (frontend, backend, database, file storage) deploys on **Vercel**. The backend runs as serverless functions (Next.js route handlers), which fits this game: every server interaction is a short request (create a run, fetch a batch, validate a checkpoint, save progress). The heavy work, running the player's pipeline, happens in their browser. There are no long-running servers and no persistent connections.

- **App:** Next.js (App Router) + TypeScript (strict) + Tailwind CSS.
- **In-browser engine:** DuckDB-WASM in a Web Worker.
- **Game scenes:** a lightweight 2D library (Phaser or PixiJS, decided in a spike) for the atmospheric layer only: the town, the clock, candles, the timeline, the tombstone. Everything textual (editor, tables, story) stays in the DOM.
- **Editor:** CodeMirror 6 with SQL language support.
- **Server:** Next.js route handlers (Node runtime) for run creation, data generation, checkpoint validation, and progress.
- **Puzzle engine:** pure TypeScript, server-only (`import "server-only"`), so generators and expected answers never ship to the browser.
- **Database:** Postgres (via Vercel's marketplace integration) with Drizzle ORM and migrations.
- **File storage:** Vercel Blob for cached generated data, keyed by `(puzzle, seed)`.
- **Auth:** GitHub OAuth via Auth.js. Anonymous play is allowed, and signing in later claims the anonymous progress.
- **Tests:** Vitest for the engine and runtime, using DuckDB's Node package so pipeline semantics are tested on the same engine as the browser. Playwright for end-to-end and visual checks.
- **Package manager:** bun (installs and scripts). Vitest still runs on Node, so DuckDB's Node package behaves as in production.

**Anti-cheat stance:** good enough, not paranoid. Generators and expected outputs live only on the server. Hidden batches are sent only when the player runs the night, and that costs a candle if they fail. Determined players could still capture batches in devtools, and that's accepted. Don't build obfuscation that makes the code worse.

**Vercel constraints:** function duration, bundle size, and memory limits shape the generator design. Verify the actual limits for the account's plan in the Phase 0 spike and record them in `docs/decisions/`. Don't assume. Generated run data should stay small (a few MB per hour at most).

---

## 8. Engineering standards (non-negotiable)

This is a public portfolio piece. Hold it to the bar of a senior engineer's flagship open-source project.

**Code**
- TypeScript `strict`, no `any` (use `unknown` plus narrowing), no `@ts-ignore`. ESLint (typescript-eslint strict + Next.js rules) and Prettier, all clean.
- Determinism: all randomness flows from a seeded PRNG derived from `(puzzle_id, run_seed, slot)` via a stable hash. Never use `Math.random()` in the engine, never depend on object key or `Set` iteration order for output, and never read wall-clock time in generation.
- Small, focused modules. No god files, no dead code, no commented-out code, no placeholder `TODO`s in code, no emoji in code.
- Comments explain *why*. Use TSDoc on exported functions only.
- Components are accessible by construction. Prefer composition over configuration flags.
- No new dependency without a one-line justification in the commit body.

**Correctness**
- Every puzzle ships with:
  - a **reference pipeline** that survives every checkpoint across 20 seeds;
  - at least one **trap pipeline** (what a reasonable but careless engineer would write) that fails a checkpoint across 20 seeds;
  - tests for determinism (same seed, same data and expected outputs) and seed sensitivity (different seeds, different outputs).
- The Séance's Delta log must match the real Delta Lake protocol (github.com/delta-io/delta/blob/master/PROTOCOL.md). Cite the sections used in the puzzle's design doc. Don't guess protocol behavior.
- Autopsies must be technically accurate.

**Tests**
- `bun run lint`, `bun run typecheck`, and `bun run test` must pass before every commit. Playwright runs in CI and before ticking any UI item.

**Verifying it works (dev, not builds)**
- Don't run `next build` locally as a routine check. Production builds happen on Vercel: the GitHub repo is connected to the Vercel project, every pushed branch gets a preview deployment, and `main` deploys to production. A failed Vercel build is a failed item.
- Verify behavior against the running dev server (`bun run dev`), not a build:
  - The `next-devtools` MCP server reads the dev server's built-in endpoint (`/_next/mcp`). Use `nextjs_index` to find the server, then `nextjs_call` for compile and runtime errors, routes, and logs. An item isn't done while it reports errors.
  - Route handlers: call them with `curl` against `localhost` and check status and body.
  - UI: drive pages with the Playwright MCP server (navigate, click, check the console, take screenshots).
- Check a preview deployment only when the item depends on Vercel behavior (limits, Blob, Postgres, environment variables). Previews sit behind Deployment Protection, so use `vercel curl`.

**Decisions**
- Record significant technical decisions as short ADRs in `docs/decisions/NNNN-title.md` (context, decision, consequences).

---

## 9. Git workflow

There is one application, at the repo root. All work on it happens on branches and lands through pull requests.

- Work through `TODO.md` top to bottom, one numbered leaf item at a time (for example `7.1.3`).
- Each leaf item gets its own branch off `main`, named `<type>/<item>-<slug>` (for example `feat/7.1.2-porch-light-batches`, `spike/0.2-duckdb-wasm`).
- After the work: run lint, typecheck, and tests, and verify the change in the dev server as described in §8 (plus Playwright and a screenshot review for UI items). Fix everything until it's green. Tick the box in `TODO.md` on the branch.
- Push the branch and open a pull request. Its Vercel preview build must pass.
- Codex reviews every PR thoroughly (GitHub app). Codex's green light is required before any merge:
  1. Wait for Codex's review of the latest commit. If it hasn't reviewed the latest commit, comment `@codex review` to request one.
  2. Make every change Codex requests, on the branch. Only when a finding is genuinely wrong, reply on its comment with the reason instead. Resolve each conversation once it's handled.
  3. After pushing fixes, comment `@codex review` again and repeat from step 1.
  4. Codex's green light means its latest review, on the PR's head commit, reports no issues and every conversation is resolved.
- Also review the PR carefully yourself as a separate pass: read the full diff against this file's standards, check the TODO item is actually met, and look for bugs, dead code, missing tests, and scope creep. Fix anything found on the branch (which restarts the Codex loop).
- QA after the last change: rerun lint, typecheck, and tests, and re-verify the behavior in the dev server (§8), including anything Codex-driven fixes touched. Be careful: everything must be fully good.
- Stacked PRs: leave a dependent PR on its parent's branch until the parent merges. Squash-merging the parent and deleting its branch makes GitHub retarget the dependent PR to `main`. Then merge `main` into the dependent branch, resolve conflicts so the parent's changes match `main` while the dependent PR's own changes stay, and restart the Codex loop.
- Once Codex has given its green light, your own review holds up, and QA passes, comment `sgtm` on the PR, then squash-merge it so `main` gets **exactly one commit** per item, and delete the branch.
- Items marked **Stop and ask the repo owner to review** wait for the owner to approve the PR instead of an `sgtm` merge.
- Commit messages and PR titles use Conventional Commits with the TODO number as scope, for example `feat(7.1.2): generate porch light batches`. Use an imperative subject of 72 characters or fewer, and a short body explaining why when it isn't obvious.
- **Do not add any `Co-Authored-By` trailer, "Generated with" line, or any other AI attribution to commits, PR descriptions, or files.** All commits are authored by the repo owner only. This overrides any default attribution behavior.
- Never amend, rebase, or force-push commits that are already pushed, and never push to `main` directly.
- If an item needs splitting, add numbered sub-items (`7.1.3` becomes `7.1.3.1`, `7.1.3.2`, and so on), each with its own branch and PR. Don't silently bundle work.
- `docs/` is local-only working material, excluded from git by a root-anchored `.gitignore` rule (`/docs/`). Spikes are throwaway experiments: their results and decisions live in `docs/`, and their code never enters the app. A TODO item whose only output lives in `docs/` still gets a PR, carrying just its `TODO.md` tick.
- If something can't be verified (a Vercel limit, browser behavior), stop and ask instead of guessing.
