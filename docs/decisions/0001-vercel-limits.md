# 0001: Vercel function limits

Date: 2026-10-30
Status: Accepted

## Context

Server-side generation, batch serving, and checkpoint validation all run as Vercel Functions (Next.js route handlers). The game's design depends on how long a function may run, how much memory it gets, and how large its bundle and payloads may be. CLAUDE.md §7 requires these to be verified for the account's actual plan, not assumed.

Spike 0.1 (`spikes/0.1-vercel-hello/`) deployed a minimal Next.js 16 app with one route handler, `/api/limits`, which reports its runtime and can hold the request open for `?sleep=N` seconds. The project was deployed to the account's Hobby team with Fluid compute (the default for new projects).

## Measurements

| Limit | Measured | Documented (Hobby, Fluid compute) |
|---|---|---|
| Plan | Hobby (`vercel teams ls`) | n/a |
| Runtime | Node `v26.13.0` | Node.js 26.x project default |
| Region | `iad1` | `iad1` by default; Hobby is single-region |
| Max duration | `maxDuration = 300` accepted at deploy. `sleep=295` returned in 297 s; `sleep=320` failed at 302 s with `FUNCTION_INVOCATION_TIMEOUT` | 300 s default and maximum |
| Memory | V8 `heap_size_limit` 2036 MB, consistent with a 2 GB instance; idle RSS 83–85 MB. `AWS_LAMBDA_FUNCTION_MEMORY_SIZE` is hidden under Fluid compute | 2 GB / 1 vCPU, not configurable on Hobby |
| Bundle size | Not measured (the spike is far below any limit) | 250 MB uncompressed; up to 5 GB with large functions (beta) |
| Request / response body | Not measured | 4.5 MB, else `413 FUNCTION_PAYLOAD_TOO_LARGE` |
| File descriptors | Not measured | 1,024 shared across concurrent executions |

Source for documented values: https://vercel.com/docs/functions/limitations (last updated 2026-08-24).

Previews and production deployments on this account sit behind Vercel Authentication (Deployment Protection), so probes used `vercel curl`, which authenticates as the account owner.

## Decision

Design every server interaction to finish well inside these limits on Hobby:

- Treat **4.5 MB** as the hard ceiling for any single response, including a batch. Size batches so each response stays under about 2 MB; anything larger goes to Vercel Blob and the client fetches it by URL.
- Target generation of one puzzle-hour in under 10 s and under 512 MB of heap. The 300 s cap is a safety net, not a budget: players wait on these requests.
- Do not rely on Pro-only limits (800 s duration, 4 GB memory, multiple regions).
- Keep the Parquet writer and DuckDB out of server bundles where possible; the 250 MB cap is generous, but cold starts scale with bundle size.

## Consequences

- Spike 0.3 must check its ~2 MB generated output against the 4.5 MB body limit and measure generation time against the 10 s target.
- Batch serving (TODO 2.3.2) needs a size check, with a Blob fallback for oversized batches.
- Public launch needs Deployment Protection turned off for the production domain, or the game will not be playable from a link.
- If the game ever needs longer or heavier server work, moving to Pro raises duration to 800 s and memory to 4 GB without code changes.
