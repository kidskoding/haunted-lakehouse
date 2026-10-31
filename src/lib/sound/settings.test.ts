import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  saveSettings,
  volumeToGain,
  type SettingsStorage,
} from "./settings";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  } satisfies SettingsStorage & Record<string, unknown>;
}

const throwing: SettingsStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("sound settings", () => {
  it("are muted by default", () => {
    expect(DEFAULT_SETTINGS.muted).toBe(true);
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trip through storage", () => {
    const storage = memoryStorage();
    saveSettings(storage, { muted: false, volume: 0.25 });
    expect(loadSettings(storage)).toEqual({ muted: false, volume: 0.25 });
  });

  it("fall back to defaults when storage throws, and saving never throws", () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => {
      saveSettings(throwing, { muted: false, volume: 1 });
    }).not.toThrow();
  });

  it("repair corrupt or hand-edited values", () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: "{not json" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: "null" }))).toEqual(DEFAULT_SETTINGS);
    expect(
      loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ muted: "no", volume: 7 }) })),
    ).toEqual({ muted: true, volume: 1 });
    expect(
      loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ muted: false, volume: -2 }) })),
    ).toEqual({ muted: false, volume: 0 });
  });
});

describe("volumeToGain", () => {
  it("runs from silence to unity on a squared curve", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
  });

  it("is monotonic and clamped", () => {
    const steps = Array.from({ length: 21 }, (_, i) => volumeToGain(i / 20));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1] ?? Infinity);
    }
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(3)).toBe(1);
    expect(volumeToGain(Number.NaN)).toBe(volumeToGain(DEFAULT_SETTINGS.volume));
  });
});
