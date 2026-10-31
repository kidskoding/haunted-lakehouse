import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY, serializeLayout, type RunLayoutSizes } from "./layout";

const WIDE: RunLayoutSizes = { left: 44, story: 60, dag: 20, results: 30 };
const TALL: RunLayoutSizes = { left: 28, story: 70, dag: 18, results: 40 };

type FakeStorage = Pick<Storage, "getItem" | "setItem" | "clear">;

function memoryStorage(): FakeStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    clear: () => {
      items.clear();
    },
  };
}

/** A window that is only an event target, with `localStorage` as the test defines it. */
function stubWindow(localStorage: PropertyDescriptor): EventTarget {
  const target = new EventTarget();
  Object.defineProperty(target, "localStorage", localStorage);
  vi.stubGlobal("window", target);
  return target;
}

function storageEvent(key: string | null): Event {
  return Object.assign(new Event("storage"), { key });
}

// The store keeps its value at module scope, so every test loads a fresh copy.
async function loadStore() {
  vi.resetModules();
  return (await import("./layout-store")).layoutStore;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("layoutStore across tabs", () => {
  it("follows a layout another tab saved", async () => {
    const storage = memoryStorage();
    const win = stubWindow({ value: storage });
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual(DEFAULT_LAYOUT);

    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(WIDE));
    win.dispatchEvent(storageEvent(LAYOUT_STORAGE_KEY));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual(WIDE);
  });

  it("ignores changes to other keys", async () => {
    const storage = memoryStorage();
    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(WIDE));
    const win = stubWindow({ value: storage });
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual(WIDE);

    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(TALL));
    win.dispatchEvent(storageEvent("haunted-lakehouse:sound"));

    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual(WIDE);
  });

  it("falls back to the defaults when another tab clears storage", async () => {
    const storage = memoryStorage();
    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(WIDE));
    const win = stubWindow({ value: storage });
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual(WIDE);

    storage.clear();
    win.dispatchEvent(storageEvent(null));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual(DEFAULT_LAYOUT);
  });

  it("stops listening once the last subscriber leaves", async () => {
    const storage = memoryStorage();
    const win = stubWindow({ value: storage });
    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.snapshot();
    unsubscribe();

    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(WIDE));
    win.dispatchEvent(storageEvent(LAYOUT_STORAGE_KEY));

    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual(DEFAULT_LAYOUT);
  });
});

describe("layoutStore when storage fails", () => {
  it("resizes in memory when localStorage cannot even be reached", async () => {
    stubWindow({
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual(DEFAULT_LAYOUT);

    store.save(WIDE);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual(WIDE);
  });

  it("resizes in memory when reading storage throws", async () => {
    stubWindow({
      value: {
        getItem: () => {
          throw new DOMException("Blocked.", "SecurityError");
        },
        setItem: () => undefined,
      },
    });
    const store = await loadStore();
    expect(store.snapshot()).toEqual(DEFAULT_LAYOUT);
    store.save(TALL);
    expect(store.snapshot()).toEqual(TALL);
  });

  it("keeps the new layout when setItem throws", async () => {
    const storage = memoryStorage();
    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(WIDE));
    stubWindow({
      value: {
        getItem: storage.getItem,
        setItem: () => {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        },
      },
    });
    const store = await loadStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual(WIDE);

    expect(() => {
      store.save(TALL);
    }).not.toThrow();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual(TALL);
    expect(storage.getItem(LAYOUT_STORAGE_KEY)).toBe(serializeLayout(WIDE));
  });
});
