import "server-only";
import { marisol, mayor, narrator, wren } from "../lines";
import type { NarrativePack } from "../types";

const CHECKED =
  "I've checked mine three times. He has checked his zero times, but it's also correct, for what it counts.";

export const changeling: NarrativePack = {
  puzzleId: "changeling",
  title: "The Changeling",
  status: "draft",
  owner: "marisol",
  bindings: {
    marisol_active: "count",
    mayor_active: "count",
    active_at_checkpoint: "count",
    merely_bright: "count",
  },
  intro: [
    marisol(
      `My dashboard says {*marisol_active} active houses. The Mayor's says {*mayor_active}. ${CHECKED}`,
      `My dashboard and the Mayor's disagree on how many houses are active. ${CHECKED}`,
    ),
    mayor("Mine counts lit porches. Lit means active. This is common sense."),
    wren(
      "The charter's in the lakehouse, both of you. Section four. Common sense isn't what's on the plaque.",
    ),
    narrator(
      "*§4. Active houses.* A house is active on Halloween night while its porch is lit and it has answered its door within the half hour past. A house that has run out of candy and left its light on is not active; it is merely bright.",
    ),
  ],
  cleared: [
    marisol(
      "{active_at_checkpoint} active, by the charter. The Mayor's number includes {merely_bright|plural:house that is,houses that are} merely bright. He's taken it well.",
    ),
    mayor("I have taken it. I'm not sure 'well' is in the minutes."),
    wren("Funny old document, the charter. You'd be surprised what's been taken out of it."),
  ],
  hook: [
    marisol(
      "I'm so sorry. The Mayor and I have both built dashboards of active houses, and they don't agree, and we are both, I think, right?",
    ),
  ],
  autopsy: {
    title: "A metric is its definition",
    town: "Marisol and the Mayor each counted 'active houses' correctly, by different rules. The Mayor counted lit porches. The charter, the town's adopted definition, asked for a lit porch and a door answered within the past half hour. By the charter, {active_at_checkpoint|plural:house was,houses were} active; {merely_bright|plural:lit house,lit houses} had stopped answering.",
    tempting:
      "Lit means active. The Mayor's definition is intuitive and cheap, and it agrees with the charter early in the night, while every lit house is still handing out candy. The two drift apart as bowls run empty and porches stay lit.",
    idea: "A **metric definition** is a specification, not a query. Two pipelines can both be free of bugs and still disagree, because they implement different definitions of the same word. The fix is not to debug harder. Find the definition the organization adopted and implement it literally, including its time window: 'within the half hour past' is a rolling window ending at each checkpoint. Then name the metric so the definition travels with the number.",
    production:
      "'Active users', 'revenue', and 'churn' each have several defensible definitions, and teams regularly ship two dashboards that disagree with no bug in either. Weeks then go into arguing over which number is right. Teams prevent it with a metrics layer that defines each metric once, a named owner for every definition, and tests that pin the definition down with edge cases, like the house that ran out of candy and left its light on.",
    search: ["metric definitions", "semantic layer", "metrics layer", "single source of truth"],
  },
  epitaphs: ["Went with common sense.", "Never read the plaque."],
};
