import "server-only";
import { mayor, thorne } from "../lines";
import type { NarrativePack } from "../types";

const RULES =
  "I have the rules here. One child, one ballot. A child may change her mind as often as she likes until ten o'clock, and only her last word counts. Nobody gets extra votes for being indecisive.";

export const hallOfMirrors: NarrativePack = {
  puzzleId: "hall-of-mirrors",
  title: "The Hall of Mirrors",
  status: "draft",
  owner: "thorne",
  bindings: {
    leader_name: "name",
    leader_costume: "name",
    leader_votes: "count",
    winner_name: "name",
    winner_costume: "name",
    winner_votes: "count",
  },
  intro: [
    thorne(
      `The leaderboard gives {*leader_name}, the {*leader_costume}, {*leader_votes|plural:vote,votes}. That is more votes than children who have voted. ${RULES}`,
      `The leaderboard has one child winning by more votes than there are voters. ${RULES}`,
    ),
    mayor(
      "I'm presenting the trophy at ten. It's very heavy. I'd like to hand it to the right child.",
    ),
  ],
  cleared: [
    thorne(
      "{winner_name}, the {winner_costume}, with {winner_votes|plural:vote,votes}. A worthy child. Very committed to the bit.",
    ),
    mayor("And the other one?"),
    thorne("Popular with children who can't decide."),
  ],
  hook: [
    thorne(
      "The costume contest leaderboard says one child is winning by a mile. I have walked the whole parade. Nobody is winning by a mile.",
    ),
  ],
  autopsy: {
    title: "Grain, and the join that multiplies",
    town: "Each child cast one ballot and could revise it until ten. The ballots feed held one row per ballot; the revisions feed held one row per change. The leaderboard joined the two and counted rows, so every revision copied its ballot's vote. By the rules, {winner_name} won with {winner_votes|plural:vote,votes}.",
    tempting:
      "Join ballots to their revisions to find each child's current pick, then count. The join looks harmless, because each ballot appears once on its own side. But a ballot revised four times matches four rows, and each of them carries a vote. The most indecisive children's favourite rises to the top.",
    idea: "**Grain** is what one row represents. Before aggregating, say it out loud: one row per ballot, not per revision. A **join fan-out** happens when a key is unique on one side and repeated on the other, so the result takes the finer grain. Reduce the many side to the grain you need first, here the latest revision per ballot with `row_number()` ordered by revision time, and only then join or count.",
    production:
      "Fan-out sits behind many inflated revenue reports: orders joined to line items before summing the order total, or users joined to sessions before counting users. It rarely errors; it only produces a bigger number that looks plausible. Teams catch it with uniqueness tests on every model's key, row counts compared before and after each join, and a model's grain written into its name or description where reviewers will see it.",
    search: ["data grain", "join fan-out", "row_number latest record", "uniqueness tests"],
  },
  epitaphs: [
    "Counted every time a child changed her mind.",
    "Gave the trophy to the most indecisive fans.",
  ],
};
