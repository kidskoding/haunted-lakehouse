import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDuckDB } from "./duckdb";

type Step = "instantiate" | "open" | "getVersion" | "connect";

const fake = vi.hoisted(() => ({
  failing: null as Step | null,
  instances: [] as { terminate: () => Promise<void>; terminated: boolean }[],
}));

// A stand-in for DuckDB-WASM whose load fails at a chosen step, so the test can see what
// the loader does with the worker it already created.
vi.mock("@duckdb/duckdb-wasm", () => {
  const step = (name: Step, value: unknown) => () =>
    fake.failing === name ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve(value);
  class AsyncDuckDB {
    terminated = false;
    readonly instantiate = step("instantiate", undefined);
    readonly open = step("open", undefined);
    readonly getVersion = step("getVersion", "v1.4.3");
    readonly connect = step("connect", {});
    constructor() {
      fake.instances.push(this);
    }
    terminate(): Promise<void> {
      this.terminated = true;
      return Promise.resolve();
    }
  }
  return {
    AsyncDuckDB,
    VoidLogger: vi.fn(),
    selectBundle: () =>
      Promise.resolve({ mainModule: "duckdb-eh.wasm", mainWorker: "duckdb-eh.worker.js" }),
  };
});

describe("loadDuckDB", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", vi.fn());
    fake.failing = null;
    fake.instances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<Step>(["instantiate", "open", "getVersion", "connect"])(
    "stops the DuckDB worker when %s fails",
    async (step) => {
      fake.failing = step;
      await expect(loadDuckDB(() => undefined)).rejects.toThrow(`${step} failed`);
      expect(fake.instances).toHaveLength(1);
      expect(fake.instances[0]?.terminated).toBe(true);
    },
  );

  it("keeps the worker running when the load succeeds", async () => {
    const db = await loadDuckDB(() => undefined);
    expect(db.version).toBe("v1.4.3");
    expect(fake.instances[0]?.terminated).toBe(false);
  });
});
