import { describe, expect, it } from "vitest";
import { SLOTS } from "@/server/engine/slots";
import { NIGHT } from "./fixtures";

describe("the gallery's night", () => {
  it("matches the engine's slot table", () => {
    expect(NIGHT.map(({ slot, time, act, boss }) => ({ slot, time, act, boss }))).toEqual(
      SLOTS.map(({ slot, time, act, boss }) => ({ slot, time, act, boss })),
    );
  });

  it("marks only the 1:00am hour as the clock's second pass", () => {
    expect(NIGHT.filter((slot) => slot.repeat).map((slot) => slot.time)).toEqual(["01:00"]);
  });
});
