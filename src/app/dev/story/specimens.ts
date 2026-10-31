import "server-only";
import type { StoryPanelProps } from "@/components/run/story";
import { fogNarrative } from "@/server/engine/curses/fog";
import type { Puzzle } from "@/server/engine/puzzle";
import { ALL_PUZZLES } from "@/server/engine/puzzles";
import { generatePuzzle } from "@/server/engine/registry";
import { runBindings, type Voice } from "@/server/narrative/bindings";
import { ending } from "@/server/narrative/endings";
import { clearedScene, introScene, renderCallouts } from "@/server/narrative/hour";
import { narrativePack } from "@/server/narrative/packs";
import { renderScene, type RenderContext } from "@/server/narrative/render";

const SEED = "raven-pumpkin-13";
export const INTERN: Voice = { character: "intern", stage: "W0" };

export interface Specimen extends StoryPanelProps {
  readonly id: string;
  readonly caption: string;
}

function puzzle(id: string): Puzzle {
  const found = ALL_PUZZLES.find((entry) => entry.id === id);
  if (!found) throw new Error(`No puzzle ${id}.`);
  return found;
}

/** The story context for one seed of a puzzle, as a run would build it, fogged on request. */
export function contextFor(puzzleId: string, fogged: boolean, voice = INTERN): RenderContext {
  const source = puzzle(puzzleId);
  const data = generatePuzzle(source, SEED);
  const { narrative, withheld } = fogged
    ? fogNarrative(source, data.narrative)
    : { narrative: data.narrative, withheld: [] };
  const run = runBindings({
    seed: SEED,
    character: voice.character,
    candles: 4,
    retention: source.retention,
    checkpoints: data.checkpoints,
  });
  return { bindings: { ...run, ...narrative }, withheld };
}

/**
 * Real scenes from the launch packs, rendered by the narrative engine against generated data,
 * so the gallery shows the text a player would read.
 */
export function storySpecimens(): Specimen[] {
  const porch = narrativePack("porch-lights");
  const porchContext = contextFor("porch-lights", false);
  const door = narrativePack("thirteenth-door");
  const doorFogged = contextFor("thirteenth-door", true);
  const doorClear = contextFor("thirteenth-door", false);
  const dusk = contextFor("possessed-feed", true);
  const mirrors = narrativePack("hall-of-mirrors");

  return [
    {
      id: "porch-intro",
      caption: "Porch Lights, the intro, with the first-night tips",
      title: porch.title,
      lines: renderScene(introScene(porch, INTERN), porchContext, INTERN),
      asides: renderCallouts(porch, porchContext, "tour"),
    },
    {
      id: "door-fog",
      caption: "The Thirteenth Door, the intro, under the Curse of the Fog",
      title: door.title,
      lines: renderScene(introScene(door, INTERN), doorFogged, INTERN),
    },
    {
      id: "door-cleared",
      caption: "The Thirteenth Door, cleared",
      title: door.title,
      lines: renderScene(clearedScene(door, doorClear.bindings, INTERN), doorClear, INTERN),
    },
    {
      id: "dusk-fog",
      caption: "The Dusk ending, after the Possessed Feed under the Fog",
      title: ending("act-1").title,
      lines: renderScene(ending("act-1").scene, dusk, INTERN),
    },
    {
      id: "mirrors-hook",
      caption: "The Hall of Mirrors, the hook (draft text)",
      title: mirrors.title,
      lines: renderScene(mirrors.hook, { bindings: {}, withheld: [] }, INTERN),
    },
    {
      id: "empty",
      caption: "Before an hour opens",
      title: "Story",
      lines: [],
    },
  ];
}
