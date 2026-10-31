import { describe, expect, it } from "vitest";
import { failureCost, isSlot, slotDefinition, SLOTS } from "./slots";

describe("slots", () => {
  it("numbers the ten hours of the night in order", () => {
    expect(SLOTS.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("never lets difficulty drop as the night goes on", () => {
    SLOTS.slice(1).forEach((s, i) => {
      expect(s.tier).toBeGreaterThanOrEqual(SLOTS[i]?.tier ?? 0);
    });
  });

  it("ends each act on a boss", () => {
    expect(SLOTS.filter((s) => s.boss).map((s) => s.slot)).toEqual([3, 7, 10]);
    for (const boss of SLOTS.filter((s) => s.boss)) {
      const next = SLOTS[boss.slot];
      if (next) expect(next.act).toBe(boss.act + 1);
    }
  });

  it("recognizes slots and looks them up", () => {
    expect([0, 1, 10, 11, 2.5].map(isSlot)).toEqual([false, true, true, false, false]);
    expect(slotDefinition(9).time).toBe("01:00");
  });
});

describe("failureCost", () => {
  it("takes two candles at a boss and one anywhere else", () => {
    expect(SLOTS.map(({ slot }) => failureCost(slot))).toEqual([1, 1, 2, 1, 1, 1, 2, 1, 1, 2]);
  });
});
