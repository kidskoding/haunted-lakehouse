import "server-only";
import { marisol, wren } from "../lines";
import type { NarrativePack } from "../types";

const wrenCleared = wren("Thirteen's only unlucky if you can count. Most people can't, tonight.");

export const thirteenthDoor: NarrativePack = {
  puzzleId: "thirteenth-door",
  title: "The Thirteenth Door",
  status: "launch",
  owner: "marisol",
  bindings: {
    cursed_count: "count",
    cursed_street: "name",
    cursed_on_street: "count",
    cursed_household: "name",
  },
  intro: [
    marisol(
      "There's an old rule. A house that gives out exactly thirteen pieces before 7:00pm is cursed for the year. The Mayor wants the street with the most cursed houses. Nothing counts pieces. Each bowl sits on a scale that reports the weight of what's left, honest to within a couple of grams. The rule goes by the scales: what a bowl's scale had weighed by its last report before seven is what that house gave. Every household bought one kind of candy from the Co-op, in the standard bag. When a bowl runs low, they tip in a whole new bag. Tipping in a bag is not giving. I have had this argument.",
    ),
  ],
  cleared: [
    marisol(
      "{cursed_count|plural:cursed house,cursed houses}, and {cursed_street} has {cursed_on_street} of them. I'll tell the {cursed_household} family gently.",
    ),
    wrenCleared,
  ],
  clearedIfNone: {
    binding: "cursed_count",
    scene: [
      marisol("Nobody's cursed this year. I'll tell the list. The list will be disappointed."),
      wrenCleared,
    ],
  },
  hook: [
    marisol(
      "Excuse me. Hello. I'm Marisol, from the Co-op. Is now a bad time? It's about the thirteen.",
    ),
  ],
  autopsy: {
    title: "Counting from a gauge",
    town: "Nothing in Hollow Creek counted candy. Each scale reported what was left in its bowl, give or take a couple of grams, and every house stocked one kind of candy. Pieces given were the drops between one reading and the next, divided by that candy's weight and rounded past the noise. Rises were refills and counted for nothing. {cursed_count|plural:house,houses} came to exactly thirteen.",
    tempting:
      "Count door scans, because a knock looks like a gift. That undercounts from the first visit, because children take more than one piece. Or subtract the last reading from the first and divide. That holds until the first refill, when a whole bag tipped in cancels out the pieces that emptied the bowl.",
    idea: "A **gauge** reports a level; a **counter** reports how much has happened. To get a flow from a gauge, order each sensor's readings by time and take the **delta** between neighbours, for example with `lag()`. Then classify each delta: a drop is consumption, a rise is a replenishment, and a change inside the sensor's tolerance is noise. Convert units last. Rounding to whole pieces only works because one piece outweighs the noise.",
    production:
      "Tank levels, storage quotas, inventory snapshots, and account balances all have this shape. Common failures are summing levels instead of differences, netting a top-up against usage, and reading a counter that reset after a restart as a huge negative flow. Teams keep the derivation in one tested model, flag deltas outside physical bounds, and keep the raw readings so the rule can be rerun when it changes.",
    search: [
      "gauge vs counter metrics",
      "lag window function",
      "counter resets",
      "sensor tolerance",
    ],
  },
  epitaphs: ["Mistook a refill for generosity.", "Counted knocks, not candy."],
};
