import { EngineClient } from "./client";

let engine: EngineClient | null = null;

/** The page's one engine. Browser only: it starts a Web Worker on first use. */
export function getEngine(): EngineClient {
  engine ??= new EngineClient(
    () =>
      // Written inline so the bundler sees the worker entry and emits it as its own chunk.
      new Worker(new URL("./engine.worker.ts", import.meta.url), {
        type: "module",
        name: "engine",
      }),
  );
  return engine;
}
