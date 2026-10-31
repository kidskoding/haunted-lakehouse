# Agent workflow — Haunted Lakehouse

This is the operating contract for coding agents. The product bible is `CLAUDE.md` (included from there via `@AGENTS.md`). Follow both.

## One item, one branch, one PR

- Work through `TODO.md` top to bottom, **one numbered leaf item** at a time (e.g. `7.1.3`).
- Branch off `main`: `<type>/<item>-<slug>` (e.g. `feat/5.3.6-editor`).
- Conventional Commits with the TODO number as scope: `feat(5.3.6): add the sql editor`. Subject ≤ 72 characters. Imperative mood.
- Tick the box in `TODO.md` on the branch. Never silently bundle items; split into numbered sub-items if needed.

## Git identity and attribution

- Author as the repo owner only (`Anirudh Konidala <68204671+kidskoding@users.noreply.github.com>`, or the owner's own email).
- **No AI attribution anywhere**: no `Co-Authored-By`, no "Generated with", no Claude/Cursor footers in commits, PR bodies, or files.
- Never push to `main`. Never force-push. Never amend a commit that is already pushed.
- Never update git config.

## Before every commit

```
bun run lint
bun run typecheck
bunx prettier --check .
bun run test
```

UI items also need `bunx playwright test` and screenshots at 1280, 1440, and 1920. Never run `next build` locally; verify with `bun run dev`.

## Code bar

- TypeScript `strict`, no `any`, no `@ts-ignore`.
- Determinism: seeded PRNG only in the engine; no `Math.random()`, no wall-clock in generation, no reliance on object-key / `Set` iteration order for output.
- Small modules; no dead code, no placeholder TODOs in code, no emoji in code.
- Comments explain _why_. TSDoc on exported functions only.
- No new dependency without a one-line justification in the commit body.
- `docs/` is gitignored and local-only.

## UI

- Follow `design-taste-frontend` house rules: no gradients, no eyebrow labels, no tiny tracked uppercase, no shadows at rest, no glass, no icon cards.
- Audit accessibility: keyboard, visible focus, WCAG AA, `prefers-reduced-motion`.
- Use only tokens from `src/app/tokens.css`.
- Critique with `impeccable` before ticking a UI TODO item.

## Merge loop (per PR)

1. Open the PR, then comment `@codex review`.
2. Wait for Codex's review **of the head commit**. In the summary comment's `codex-review-state` JSON: `commit_sha` must equal the PR head, and `has_unresolved_findings` must be false.
3. Fix every real finding with a test that fails before the fix. If a finding is wrong, reply on its thread explaining why. Resolve each thread, push, then `@codex review` again.
4. If Codex says "Setup repeatedly failed", comment `@codex review` again later.
5. Checks: lint/tests and Playwright must pass. **Vercel failing with "Deployment rate limited" is approved to merge past.**
6. Comment `sgtm`, then squash-merge with an explicit body so no co-author trailer sneaks in:

```
gh pr merge N --squash --subject "<PR title>" --body "<one line>" --match-head-commit <head sha>
```

7. Stacked PR after parent merges: retarget to `main`, merge the final parent branch then `main` into it. Resolve `TODO.md` as **main's file plus this item's tick only**. Never take a whole branch's `TODO.md`.

## Owner decisions (do not guess — ask)

- DuckDB `json` (and optionally `parquet`) extension loading in the browser WASM engine.
- Postgres / Neon setup (`vercel integration add neon`, env pull, migrate), `SESSION_SECRET`, GitHub OAuth for auth.
- GitHub squash-merge default message setting ("Pull request title").

## Stop conditions

- Items marked **Stop and ask the repo owner to review** wait for the owner, not an `sgtm` merge.
- If something cannot be verified (a Vercel limit, browser behavior), stop and ask instead of guessing.
