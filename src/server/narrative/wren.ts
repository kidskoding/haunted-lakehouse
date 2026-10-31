import "server-only";
import type { CharacterId } from "../engine/run/types";
import { holdsEveryPage, type PageId, type StoryProgress } from "./progress";
import { wren } from "./lines";
import type { Line } from "./types";

/**
 * How much Wren has told the player, from W0 (first run ever) to W6 (true ending seen). OW
 * is the player being Wren, whose lines become her own thoughts.
 */
export type WrenStage = "W0" | "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "OW";

export type WrenMoment = "run-start" | "hour-cleared" | "candle-lost" | "death";

/** The highest stage the player has reached. */
export function wrenStage(progress: StoryProgress, character: CharacterId): WrenStage {
  if (character === "old_wren") return "OW";
  const seen = (ending: StoryProgress["endingsSeen"][number]) =>
    progress.endingsSeen.includes(ending);
  if (seen("true")) return "W6";
  if (holdsEveryPage(progress)) return "W5";
  if (seen("act-3")) return "W4";
  if (seen("act-2")) return "W3";
  if (seen("act-1")) return "W2";
  return progress.runsFinished > 0 ? "W1" : "W0";
}

/** True once Wren has said the Hollow's name: the Act II ending, and every stage after it. */
export function hollowNamed(stage: WrenStage): boolean {
  return stage !== "W0" && stage !== "W1" && stage !== "W2";
}

export const WREN_LINES: Readonly<Record<WrenStage, Readonly<Record<WrenMoment, Line>>>> = {
  W0: {
    "run-start": wren("Nobody's had your chair since 2020. Sit carefully. It remembers."),
    "hour-cleared": wren("Good. Now write down why it was right."),
    "candle-lost": wren("Look at what arrived just before it broke."),
    death: wren("Happens. Come back tomorrow night. It'll be the same night."),
  },
  W1: {
    "run-start": wren("Back again. The night's the same. You aren't."),
    "hour-cleared": wren("Better than last time. I was there last time."),
    "candle-lost": wren("Same place as before? No. Different place. That's progress."),
    death: wren("You're getting further. The town's getting used to you."),
  },
  W2: {
    "run-start": wren("You kept the rows you couldn't read. I've been thinking about that."),
    "hour-cleared": wren("The old keepers would have liked that."),
    "candle-lost": wren("Even the book had crossings-out."),
    death: wren("Rest. The feeds will still be wrong tomorrow."),
  },
  W3: {
    "run-start": wren(
      "The diary's still there. Finance keeps trying to delete it. I keep saying no.",
    ),
    "hour-cleared": wren("It watches you work, you know. It likes the careful ones."),
    "candle-lost": wren("It doesn't break things. It stands where they're broken."),
    death: wren("The Hollow keeps everyone eventually. It's the only thing in town that does."),
  },
  W4: {
    "run-start": wren("You've heard what I did. You came back anyway."),
    "hour-cleared": wren("Seven minutes. You're getting back more than I took."),
    "candle-lost": wren("I stopped too late once. You've got time to stop early."),
    death: wren("Some nights I wish I'd stopped at 1:41."),
  },
  W5: {
    "run-start": wren("Seven pages. All of them. Tonight we finish it."),
    "hour-cleared": wren("Nearly there. Don't hurry. I hurried."),
    "candle-lost": wren("Steady. We've waited six years. We can spare a candle."),
    death: wren("We'll try again. The pages keep."),
  },
  W6: {
    "run-start": wren("It's kept now. Tonight's just a night. Enjoy it."),
    "hour-cleared": wren("Write it down. Someone will want to know."),
    "candle-lost": wren("Happens to everyone. Happened to me in a big way."),
    death: wren("Rest. The ledger has your name in it now."),
  },
  // Her own thoughts. The bible gives her no cleared line of her own, so she borrows W6's.
  OW: {
    "run-start": wren("One candle. No charms. The way I used to do it."),
    "hour-cleared": wren("Write it down. Someone will want to know."),
    "candle-lost": wren("Sloppy. Thirty years and still sloppy."),
    death: wren("Should have stopped at 1:41."),
  },
};

export const PAGE_REACTIONS: Readonly<Record<PageId, Line>> = {
  "page-1": wren("Eliza Wren. My great-great-grandmother. She'd have hated your laptop."),
  "page-2": wren("1918. Thomas set those bowls out himself. He wouldn't let anyone eat from them."),
  "page-3": wren("That's my mother's hand. Put it somewhere dry."),
  "page-4": wren("I was twenty-five. I thought typing it up would keep it forever. Funny."),
  "page-5": wren("Repealed the Monday after. Nobody went to that meeting. I didn't either."),
  "page-6": wren("He signed it. I'd forgotten he signed it. I haven't forgotten anything else."),
  "page-7": wren("That's my note. I never sent it anywhere. I don't know how it got into a feed."),
};

/** What Wren says about a page before she's ready to say anything about it. */
export const PAGE_REACTION_TOO_EARLY = wren("Huh. Old handwriting.");

/** Old Wren's thought in Porch Lights once page I is in her Ledger. */
export const OLD_WREN_PAGE_ONE = wren("Eliza's porch is in there again. I'll leave it be.");

/**
 * Wren's line for a moment. At run start, a page found since the last run plays its reaction
 * once instead: from W2 to W5 she knows the hand; before W2 she doesn't say.
 */
export function wrenLine(stage: WrenStage, moment: WrenMoment, newPage?: PageId): Line {
  if (moment === "run-start" && newPage !== undefined) {
    if (stage === "W0" || stage === "W1") return PAGE_REACTION_TOO_EARLY;
    if (stage !== "W6" && stage !== "OW") return PAGE_REACTIONS[newPage];
  }
  return WREN_LINES[stage][moment];
}
