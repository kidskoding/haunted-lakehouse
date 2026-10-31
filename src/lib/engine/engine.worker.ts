import { loadDuckDB } from "./duckdb";
import { createEngineHost } from "./host";

/**
 * The worker's global scope, typed by hand: the project compiles against the DOM library,
 * and adding the webworker library beside it makes their global declarations collide.
 */
interface WorkerScope {
  readonly postMessage: (message: unknown) => void;
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
}

const scope = globalThis as unknown as WorkerScope;
const handle = createEngineHost(loadDuckDB, (message) => {
  scope.postMessage(message);
});

scope.addEventListener("message", (event) => {
  handle(event.data);
});
