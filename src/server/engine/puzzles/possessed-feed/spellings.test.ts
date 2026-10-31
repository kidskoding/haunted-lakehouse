import { describe, expect, it } from "vitest";
import { rngFor } from "../../random";
import type { Drop } from "./drops";
import { assignSpellings } from "./spellings";

const RETYPE = 3;

function drop(n: number, quantity: number): Drop {
  return {
    dropId: `HB-${String(n)}`,
    houseId: `H-${String(n)}`,
    item: "lantern",
    quantity,
    second: 0,
  };
}

/*
 * One drop in the retype's batch, too big for a word or a dozen, and a crowd in the next
 * batch that shows every spelling by itself. Left to the weights, the lone drop is plain
 * digits on most seeds and a shrug on some, which a cast skips as surely as the story does.
 */
const placed = [
  { drop: drop(0, 30), batch: RETYPE },
  ...Array.from({ length: 40 }, (_, i) => ({ drop: drop(i + 1, 12), batch: RETYPE + 1 })),
];

describe("spellings", () => {
  it("give the retype's own batch a count a strict cast misses", () => {
    for (let i = 0; i < 100; i++) {
      const spellings = assignSpellings(
        { placed, from: RETYPE, everyKindBy: 5, hiddenFrom: 7 },
        (...labels) => rngFor(["possessed-feed", `seed-${String(i)}`, 3, ...labels]),
      );
      expect(["unit", "word", "dozen"], `seed-${String(i)}`).toContain(spellings.get("HB-0")?.kind);
    }
  });
});
