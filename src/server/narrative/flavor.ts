import "server-only";
import type { CurseId, RelicId } from "../engine/run/types";

export interface Flavor {
  readonly name: string;
  /** The line on the card or banner, in the town's voice. */
  readonly flavor: string;
  /** What it does, plainly, for the tooltip. */
  readonly effect: string;
}

export const RELIC_FLAVOR: Readonly<Record<RelicId, Flavor>> = {
  "wrens-lantern": {
    name: "Wren's Lantern",
    flavor: "Hold it up to a feed and see every shape it has ever had.",
    effect: "Shows the schema history of one feed.",
  },
  "ravens-feather": {
    name: "The Raven's Feather",
    flavor: "Ravens see the post before it's delivered. Read one batch that hasn't landed yet.",
    effect: "Peek at one hidden batch before running the night.",
  },
  hourglass: {
    name: "The Hourglass",
    flavor: "The sand knows how many rows the Mayor's table should hold at the next bell.",
    effect: "Shows the expected row count of one gold table at the next checkpoint.",
  },
  "black-cat": {
    name: "The Black Cat",
    flavor: "Let it cross your path and the hour passes you by. No lesson, no page.",
    effect: "Skip one hour that isn't a boss.",
  },
  "spare-candle": {
    name: "Spare Candle",
    flavor: "Found in the vestry, unlit, slightly chewed.",
    effect: "One more candle.",
  },
};

export const CURSE_FLAVOR: Readonly<Record<CurseId, Flavor>> = {
  possession: {
    name: "Curse of Possession",
    flavor:
      "Something has its hand inside this feed. Before the night's out, it will change shape.",
    effect: "A feed's shape will change during the night.",
  },
  fog: {
    name: "Curse of the Fog",
    flavor: "The fog's in. Nobody can quite make out the numbers.",
    effect: "The story withholds the symptom numbers.",
  },
  "short-memory": {
    name: "Curse of Short Memory",
    flavor: "Tonight the lakehouse forgets everything but the last thing it was told.",
    effect: "Bronze keeps only the latest batch.",
  },
  darkness: {
    name: "Curse of Darkness",
    flavor: "Every lamp on the street is out, and your charms won't light.",
    effect: "Relics can't be used this hour.",
  },
};
