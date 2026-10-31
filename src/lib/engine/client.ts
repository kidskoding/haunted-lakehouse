import type { CanonicalTable } from "../canonical/hash";
import {
  parseEngineMessage,
  type EngineErrorCode,
  type EngineRequestBody,
  type EngineRequestKind,
  type EngineResponse,
  type EngineResults,
  type EngineStatus,
  type QueryResult,
} from "./protocol";

/** The part of a `Worker` the client uses, so tests can stand in a fake one. */
export interface WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  readonly postMessage: (message: unknown) => void;
  readonly terminate: () => void;
}

export type StatusListener = (status: EngineStatus) => void;

/** A request the engine could not answer. */
export class EngineError extends Error {
  override readonly name = "EngineError";

  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: EngineError) => void;
}

/**
 * The main thread's handle on the engine worker. Every call is a promise matched to its
 * answer by request id; status changes stream to subscribers. The worker starts on the first
 * call (or `start()`), and if it crashes, the next call starts a fresh one.
 */
export class EngineClient {
  readonly #createWorker: () => WorkerPort;
  readonly #listeners = new Set<StatusListener>();
  readonly #pending = new Map<number, Pending>();
  #worker: WorkerPort | null = null;
  #status: EngineStatus = { phase: "idle" };
  #nextId = 1;

  constructor(createWorker: () => WorkerPort) {
    this.#createWorker = createWorker;
  }

  get status(): EngineStatus {
    return this.#status;
  }

  /** Calls `listener` on every status change until the returned function is called. */
  subscribe(listener: StatusListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Starts loading the engine in the background; progress and failure arrive as status. */
  start(): void {
    if (this.#worker !== null) return;
    // A failed load is reported through status, so the rejection itself carries nothing new.
    this.init().catch(() => undefined);
  }

  /** Resolves once the engine is ready, with DuckDB's version. */
  init(): Promise<EngineResults["init"]> {
    return this.#request("init", {});
  }

  /** Runs SQL and returns its result as plain rows. */
  query(sql: string): Promise<QueryResult> {
    return this.#request("query", { sql });
  }

  /** Runs SQL for its effect, discarding any result. */
  exec(sql: string): Promise<null> {
    return this.#request("exec", { sql });
  }

  /** Makes `bytes` readable from SQL as the file `name`, for example `read_csv('name')`. */
  registerFile(name: string, bytes: Uint8Array): Promise<null> {
    return this.#request("registerFile", { name, bytes });
  }

  /** Reads a relation in the canonical form gold tables are hashed in. */
  canonicalRead(relation: string): Promise<CanonicalTable> {
    return this.#request("canonicalRead", { relation });
  }

  /** Drops every table, view, and registered file. */
  reset(): Promise<null> {
    return this.#request("reset", {});
  }

  /** Stops the worker. Calls in flight reject; a later call starts a fresh worker. */
  dispose(): void {
    this.#stop("terminated", "The engine was shut down.");
    this.#setStatus({ phase: "idle" });
  }

  #request<K extends EngineRequestKind>(
    kind: K,
    body: EngineRequestBody<K>,
  ): Promise<EngineResults[K]> {
    const worker = this.#ensureWorker();
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        // The worker is built from this same source and answers each kind with its result
        // type; the envelope is validated, and this is the one place the payload is trusted.
        resolve: (value) => {
          resolve(value as EngineResults[K]);
        },
        reject,
      });
      worker.postMessage({ id, kind, ...body });
    });
  }

  #ensureWorker(): WorkerPort {
    if (this.#worker !== null) return this.#worker;
    const worker = this.#createWorker();
    worker.onmessage = (event) => {
      this.#receive(event.data);
    };
    worker.onerror = () => {
      this.#stop("crashed", "The engine stopped unexpectedly.");
      this.#setStatus({ phase: "error", message: "The engine stopped unexpectedly." });
    };
    this.#worker = worker;
    return worker;
  }

  #receive(data: unknown): void {
    const message = parseEngineMessage(data);
    if (message === null) return;
    if (message.type === "status") {
      this.#setStatus(message.status);
      return;
    }
    this.#settle(message);
  }

  #settle(response: EngineResponse): void {
    const pending = this.#pending.get(response.id);
    if (pending === undefined) return;
    this.#pending.delete(response.id);
    if (response.ok) pending.resolve(response.value);
    else pending.reject(new EngineError(response.error.code, response.error.message));
  }

  #stop(code: EngineErrorCode, message: string): void {
    this.#worker?.terminate();
    this.#worker = null;
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const { reject } of pending) reject(new EngineError(code, message));
  }

  #setStatus(status: EngineStatus): void {
    this.#status = status;
    for (const listener of [...this.#listeners]) listener(status);
  }
}
