import "server-only";
import type { EndingScreenProps } from "@/components/run/ending";
import type { Voice } from "@/server/narrative/bindings";
import { ending } from "@/server/narrative/endings";
import { PAGE_IDS, type StoryEndingId } from "@/server/narrative/progress";
import { renderScene } from "@/server/narrative/render";
import { awardsForBossClear } from "@/server/unlocks/progress";
import { endingReveal } from "@/server/unlocks/reveal";
import { contextFor } from "../story/specimens";

export interface EndingFixture {
  readonly id: string;
  readonly caption: string;
  readonly props: EndingScreenProps;
}

/*
 * Only the Possessed Feed has a generator so far, so its data fills the shared bindings and
 * Dusk's numbers; the later bosses' numbers are samples until their puzzles ship.
 */
const LATER_BOSSES = {
  flameouts_total: 41,
  restored_version: 212,
  restored_rows: 4096,
  restored_last_year: 2019,
  lost_versions: 3,
  lamps_lit_final: 61,
  kids_out: 340,
  pieces_given_total: 9120,
};

function scene(id: StoryEndingId, voice: Voice, pagesFound = 0) {
  const { title, scene: lines } = ending(id, pagesFound);
  const context = contextFor("possessed-feed", false, voice);
  const bindings = { ...context.bindings, ...LATER_BOSSES, pages_found: pagesFound };
  return { title, lines: renderScene(lines, { ...context, bindings }, voice) };
}

/** Each boss ending, first time and repeat, rendered by the narrative engine as a run would. */
export function endingFixtures(): EndingFixture[] {
  const dusk = scene("act-1", { character: "intern", stage: "W1" });
  return [
    {
      id: "dusk-first",
      caption: "Dusk, the first time: Act II opens",
      props: { ...dusk, reveal: endingReveal(awardsForBossClear("act-1", [])) },
    },
    {
      id: "dusk-repeat",
      caption: "Dusk again: nothing new to open",
      props: { ...dusk, reveal: endingReveal([]) },
    },
    {
      id: "night",
      caption: "Night, after the Graveyard Shift: Act III opens",
      props: {
        ...scene("act-2", { character: "night_clerk", stage: "W2" }),
        reveal: endingReveal(awardsForBossClear("act-2", [])),
      },
    },
    {
      id: "witching-hour",
      caption: "The Witching Hour, after the Séance with three pages",
      props: {
        ...scene("act-3", { character: "purist", stage: "W3" }, 3),
        reveal: endingReveal(awardsForBossClear("act-3", PAGE_IDS.slice(0, 3))),
      },
    },
    {
      id: "kept",
      caption: "Kept, the true ending: Old Wren unlocked",
      props: {
        ...scene("true", { character: "purist", stage: "W5" }, PAGE_IDS.length),
        reveal: endingReveal(awardsForBossClear("act-3", PAGE_IDS)),
      },
    },
  ];
}
