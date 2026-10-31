import "server-only";

/**
 * Stands in for the puzzle id in run-level stream keys. Puzzle ids are kebab-case, so the `@`
 * keeps a run's draws from ever sharing a stream with a puzzle's generator.
 */
export const RUN_STREAM = "@run";
