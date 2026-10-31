import { describe, expect, it } from "vitest";
import { EngineClient, EngineError, type WorkerPort } from "./client";
import type { EngineStatus } from "./protocol";

/** A stand-in worker that records requests and lets the test answer them. */
class FakeWorker implements WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  terminated = false;

  readonly postMessage = (message: unknown): void => {
    this.posted.push(message);
  };

  readonly terminate = (): void => {
    this.terminated = true;
  };

  send(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  crash(): void {
    // Node has no ErrorEvent; the client reads nothing from the event, only that it fired.
    this.onerror?.(new Event("error") as ErrorEvent);
  }

  idOf(index: number): number {
    const message = this.posted[index];
    if (typeof message !== "object" || message === null || !("id" in message)) {
      throw new Error(`No request at ${String(index)}.`);
    }
    return Number(message.id);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new EngineClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const statuses: EngineStatus[] = [];
  client.subscribe((status) => statuses.push(status));
  const worker = (): FakeWorker => {
    const last = workers.at(-1);
    if (last === undefined) throw new Error("No worker was started.");
    return last;
  };
  return { client, workers, worker, statuses };
}

describe("EngineClient", () => {
  it("starts idle and creates no worker until asked", () => {
    const { client, workers } = setup();
    expect(client.status).toEqual({ phase: "idle" });
    expect(workers).toHaveLength(0);
  });

  it("start() creates one worker and sends init, however often it is called", () => {
    const { client, workers, worker } = setup();
    client.start();
    client.start();
    expect(workers).toHaveLength(1);
    expect(worker().posted).toEqual([{ id: 1, kind: "init" }]);
  });

  it("sends each request with a fresh id and its body", () => {
    const { client, worker } = setup();
    void client.query("SELECT 1");
    void client.exec("CREATE TABLE t (x INT)");
    const bytes = new Uint8Array([1, 2, 3]);
    void client.registerFile("a.csv", bytes);
    void client.canonicalRead("gold.porch");
    void client.reset();
    expect(worker().posted).toEqual([
      { id: 1, kind: "query", sql: "SELECT 1" },
      { id: 2, kind: "exec", sql: "CREATE TABLE t (x INT)" },
      { id: 3, kind: "registerFile", name: "a.csv", bytes },
      { id: 4, kind: "canonicalRead", relation: "gold.porch" },
      { id: 5, kind: "reset" },
    ]);
  });

  it("resolves each promise with the result carrying its id, in any order", async () => {
    const { client, worker } = setup();
    const first = client.query("SELECT 1");
    const second = client.query("SELECT 2");
    worker().send({ type: "result", id: worker().idOf(1), ok: true, value: { n: 2 } });
    worker().send({ type: "result", id: worker().idOf(0), ok: true, value: { n: 1 } });
    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 2 });
  });

  it("rejects with a typed EngineError when the worker answers with an error", async () => {
    const { client, worker } = setup();
    const query = client.query("SELECT nope");
    worker().send({
      type: "result",
      id: worker().idOf(0),
      ok: false,
      error: { code: "sql", message: "Binder Error: nope" },
    });
    const error: unknown = await query.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: "sql", message: "Binder Error: nope" });
  });

  it("streams status through download, instantiation, and ready", () => {
    const { client, worker, statuses } = setup();
    client.start();
    const sequence: EngineStatus[] = [
      { phase: "downloading", bytesLoaded: 0, bytesTotal: 100 },
      { phase: "downloading", bytesLoaded: 50, bytesTotal: 100 },
      { phase: "instantiating" },
      { phase: "ready", version: "v1.4.3" },
    ];
    for (const status of sequence) worker().send({ type: "status", status });
    expect(statuses).toEqual(sequence);
    expect(client.status).toEqual({ phase: "ready", version: "v1.4.3" });
  });

  it("stops notifying a listener once it unsubscribes", () => {
    const { client, worker } = setup();
    const seen: EngineStatus[] = [];
    const unsubscribe = client.subscribe((status) => seen.push(status));
    client.start();
    worker().send({ type: "status", status: { phase: "instantiating" } });
    unsubscribe();
    worker().send({ type: "status", status: { phase: "ready", version: "v1.4.3" } });
    expect(seen).toEqual([{ phase: "instantiating" }]);
  });

  it("ignores malformed messages and answers for unknown ids", async () => {
    const { client, worker, statuses } = setup();
    const query = client.query("SELECT 1");
    worker().send("hello");
    worker().send({ type: "status", status: { phase: "downloading", bytesLoaded: "lots" } });
    worker().send({ type: "result", id: 999, ok: true, value: null });
    worker().send({ type: "result", id: worker().idOf(0), ok: false, error: { code: "weird" } });
    expect(statuses).toEqual([]);
    worker().send({ type: "result", id: worker().idOf(0), ok: true, value: "answer" });
    await expect(query).resolves.toBe("answer");
  });

  it("rejects calls in flight when the worker crashes, then starts a fresh one", async () => {
    const { client, workers, worker, statuses } = setup();
    const query = client.query("SELECT 1");
    const crashed = worker();
    crashed.crash();
    await expect(query).rejects.toMatchObject({ code: "crashed" });
    expect(crashed.terminated).toBe(true);
    expect(statuses.at(-1)).toMatchObject({ phase: "error" });

    void client.query("SELECT 2");
    expect(workers).toHaveLength(2);
    expect(worker().posted).toEqual([{ id: 2, kind: "query", sql: "SELECT 2" }]);
  });

  it("dispose() terminates the worker, rejects calls in flight, and returns to idle", async () => {
    const { client, worker } = setup();
    client.start();
    const query = client.query("SELECT 1");
    worker().send({ type: "status", status: { phase: "ready", version: "v1.4.3" } });
    client.dispose();
    await expect(query).rejects.toMatchObject({ code: "terminated" });
    expect(worker().terminated).toBe(true);
    expect(client.status).toEqual({ phase: "idle" });
  });
});
