import "server-only";
import type { HourClearedProps } from "@/components/run/hour-cleared";
import type { RelicKind, RelicView } from "@/lib/run/bottom-bar";
import type { Voice } from "@/server/narrative/bindings";
import { CURSE_FLAVOR, RELIC_FLAVOR } from "@/server/narrative/flavor";
import { clearedScene, renderAutopsy } from "@/server/narrative/hour";
import { narrativePack } from "@/server/narrative/packs";
import { LEDGER_PAGES } from "@/server/narrative/pages";
import { renderScene, renderTemplate } from "@/server/narrative/render";
import { contextFor, INTERN } from "../story/specimens";

export interface ClearedFixture {
  readonly id: string;
  readonly caption: string;
  readonly props: Omit<HourClearedProps, "onFinish">;
}

const CLERK: Voice = { character: "night_clerk", stage: "W1" };
const OLD_WREN: Voice = { character: "old_wren", stage: "OW" };

const relics = (...kinds: RelicKind[]): RelicView[] =>
  kinds.map((kind) => ({ kind, ...RELIC_FLAVOR[kind] }));

/** One cleared hour, rendered by the narrative engine against generated data, as a run would. */
function cleared(puzzleId: string, voice: Voice) {
  const pack = narrativePack(puzzleId);
  const context = contextFor(puzzleId, false, voice);
  return {
    title: pack.title,
    beat: renderScene(clearedScene(pack, context.bindings, voice), context, voice),
    autopsy: renderAutopsy(pack, context),
  };
}

/** The Act I hours, a cursed hour's bigger offer, the Night Clerk's three, and a found page. */
export function clearedFixtures(): ClearedFixture[] {
  const page = LEDGER_PAGES["page-1"];
  return [
    {
      id: "porch",
      caption: "Porch Lights, the Intern: two relics",
      props: {
        ...cleared("porch-lights", INTERN),
        offer: relics("ravens-feather", "hourglass"),
      },
    },
    {
      id: "door-darkness",
      caption: "The Thirteenth Door under the Curse of Darkness: one more relic for the trouble",
      props: {
        ...cleared("thirteenth-door", INTERN),
        offer: relics("black-cat", "spare-candle", "ravens-feather"),
        bonusCurse: CURSE_FLAVOR.darkness.name,
      },
    },
    {
      id: "feed-boss",
      caption: "The Possessed Feed, the Act I boss, with Act II open",
      props: {
        ...cleared("possessed-feed", INTERN),
        offer: relics("hourglass", "spare-candle"),
      },
    },
    {
      id: "clerk",
      caption: "The Thirteenth Door, the Night Clerk: three relics",
      props: {
        ...cleared("thirteenth-door", CLERK),
        offer: relics("wrens-lantern", "black-cat", "hourglass"),
      },
    },
    {
      id: "page",
      caption: "Porch Lights, Old Wren: a ledger page found, and no relics, ever",
      props: {
        ...cleared("porch-lights", OLD_WREN),
        page: {
          numeral: page.numeral,
          year: page.year,
          segments: renderTemplate(page.text, { bindings: {}, withheld: [] }),
        },
        offer: [],
      },
    },
  ];
}
