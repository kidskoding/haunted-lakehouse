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
    bowl_count: "count",
    bags_sold: "count",
    scans_before_bell: "count",
    cursed_count: "count",
    cursed_street: "name",
    cursed_on_street: "count",
    cursed_household: "name",
  },
  intro: [
    marisol(
      "There's an old rule, and a list. A house that gives out exactly thirteen pieces before 7:00pm is cursed for the year. The Mayor wants the street with the most cursed houses. Each bowl sits on a scale that weighs what's left, honest to within a couple of grams. The rule goes by the scales: what a bowl's scale had weighed by its last report before seven is what that house gave. Every household bought one kind of candy from the Co-op, in the standard bag. When a bowl looks low, they tip in a whole new bag. Tipping in a bag is not giving. I have had this argument.",
    ),
    marisol(
      "The scanners logged {*scans_before_bell|number} knocks before seven. A knock is not a piece. A child takes one, two, or three.",
      "The scanners logged every knock before seven. A knock is not a piece. A child takes one, two, or three.",
    ),
  ],
  cleared: [
    marisol(
      "As of the bell: {cursed_count|words:cursed house,cursed houses}. The most on any one street is {cursed_on_street|word}: {cursed_street}. I'll tell the {cursed_household} family gently. I'll tell the Mayor quickly. He prefers it.",
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
    title: "A gauge is not a counter",
    town: "Nothing in Hollow Creek counted candy. The town's {bowl_count|plural:scale,scales} weighed what was left in each bowl, give or take two grams. Households bought {bags_sold|number} bags and tipped some in before the bell, so weights rose as well as fell. By the last reading before 7:00pm, {cursed_count|plural:house,houses} had given exactly thirteen.",
    tempting:
      "Divide each bowl's first reading minus its last before the bell by the candy's weight. It is exactly right for every bowl nobody topped up, so it looks finished. It breaks on a bowl refilled before the bell, where the bag cancels the pieces that emptied it, and tonight at least one cursed house had done that. Door scans count knocks, and one knock can take three pieces.",
    idea: "A **gauge** reports a level; a **counter** reports how much has happened. To get a flow from a gauge, take the **delta** between each sensor's neighbouring readings in its own sequence (`lag()`), rounded to whole pieces, since one piece outweighs the noise in two readings. A fall of *n* is *n* given. A rise is a **refill** in whole bags, so a rise of *r* pieces means ⌈*r* / bag⌉ × bag − *r* also went out. Cut by **event time**, the reading's own stamp, never arrival.",
    production:
      "Tank levels, battery charge, and stock between deliveries all have this shape. Its mirror is a counter that restarts at zero, which Prometheus's `rate()` treats as a reset rather than a huge negative flow. Teams keep unit sizes, like case packs, as reference data, flag deltas outside physical bounds, and keep the raw readings so a derived measure can be rebuilt when its definition changes.",
    search: [
      "gauge vs counter metrics",
      "counter resets",
      "lag window function",
      "event time vs processing time",
    ],
  },
  epitaphs: ["Mistook a refill for generosity.", "Counted knocks, not candy."],
};
