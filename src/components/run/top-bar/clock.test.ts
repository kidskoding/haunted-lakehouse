import { describe, expect, it } from "vitest";
import { actName, clockLabel, currentSlot, dialAngle, justSnuffed, slotSpoken } from "./clock";
import type { TopBarSlot } from "./types";

const witching: TopBarSlot = { slot: 9, time: "01:00", act: 3, boss: false, repeat: true };
const possessed: TopBarSlot = { slot: 3, time: "19:30", act: 1, boss: true, repeat: false };

describe("clockLabel", () => {
  it("prints the town's twelve-hour clock", () => {
    expect(clockLabel("18:00")).toBe("6:00pm");
    expect(clockLabel("22:30")).toBe("10:30pm");
    expect(clockLabel("01:00")).toBe("1:00am");
    expect(clockLabel("00:15")).toBe("12:15am");
    expect(clockLabel("12:05")).toBe("12:05pm");
  });

  it("rejects anything that isn't HH:MM", () => {
    expect(() => clockLabel("7:30pm")).toThrow(RangeError);
    expect(() => clockLabel("24:00")).toThrow(RangeError);
  });
});

describe("dialAngle", () => {
  it("points at the hour on a twelve-hour dial", () => {
    expect(dialAngle("18:00") % 360).toBe(180);
    expect(dialAngle("19:30") % 360).toBe(225);
    expect(dialAngle("01:00") % 360).toBe(30);
  });

  it("only sweeps forward across midnight", () => {
    const night = ["18:00", "18:45", "19:30", "20:15", "21:00", "21:45", "22:30", "23:15"];
    const angles = [...night, "01:00", "02:00"].map(dialAngle);
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index]).toBeGreaterThan(angles[index - 1] ?? Infinity);
    }
  });
});

describe("acts and slots", () => {
  it("names the three acts", () => {
    expect(actName(1)).toEqual({ numeral: "I", name: "Dusk" });
    expect(actName(3).name).toBe("The Witching Hour");
  });

  it("finds the current slot and refuses one that isn't listed", () => {
    expect(currentSlot({ slot: 9, slots: [possessed, witching] })).toBe(witching);
    expect(() => currentSlot({ slot: 4, slots: [possessed, witching] })).toThrow(RangeError);
  });

  it("speaks the second 1:00am as the second time", () => {
    expect(slotSpoken(witching, 9)).toBe("Hour 9, 1:00am, the second time, Act 3, now");
    expect(slotSpoken(possessed, 5)).toBe("Hour 3, 7:30pm, Act 1, boss, passed");
    expect(slotSpoken(possessed, 1)).toBe("Hour 3, 7:30pm, Act 1, boss");
  });
});

describe("justSnuffed", () => {
  it("lists the candles that went out, burning down from the right", () => {
    expect(justSnuffed(4, 3)).toEqual([3]);
    expect(justSnuffed(3, 1)).toEqual([1, 2]);
  });

  it("is empty when nothing went out", () => {
    expect(justSnuffed(3, 3)).toEqual([]);
    expect(justSnuffed(2, 3)).toEqual([]);
  });
});
