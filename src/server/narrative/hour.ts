import "server-only";
import type { Bindings, Voice } from "./bindings";
import { renderTemplate, type RenderContext, type Segment } from "./render";
import type { Callout, NarrativePack, Scene } from "./types";
import { hollowNamed } from "./wren";

/** The intro the player hears: Old Wren has her own for the hours where she'd think it. */
export function introScene(pack: NarrativePack, voice: Voice): Scene {
  return voice.character === "old_wren" && pack.oldWrenIntro ? pack.oldWrenIntro : pack.intro;
}

/** The beat after a clear, chosen by what the data says and how much Wren has told. */
export function clearedScene(pack: NarrativePack, bindings: Bindings, voice: Voice): Scene {
  if (pack.clearedAfterHollow && hollowNamed(voice.stage)) return pack.clearedAfterHollow;
  if (pack.clearedIfNone && bindings[pack.clearedIfNone.binding] === 0) {
    return pack.clearedIfNone.scene;
  }
  return pack.cleared;
}

export interface RenderedCallout extends Omit<Callout, "text"> {
  readonly segments: readonly Segment[];
}

/**
 * The hour's callouts for one moment, with the run's times and candles in them; empty for most
 * hours. Only the moment's own are rendered, since a first-break callout names a checkpoint
 * that has not failed during the tour.
 */
export function renderCallouts(
  pack: NarrativePack,
  context: RenderContext,
  when: Callout["when"],
): RenderedCallout[] {
  return (pack.tutorial ?? [])
    .filter((callout) => callout.when === when)
    .map(({ text, ...callout }) => ({ ...callout, segments: renderTemplate(text, context) }));
}

export interface RenderedAutopsy {
  readonly title: readonly Segment[];
  readonly town: readonly Segment[];
  readonly tempting: readonly Segment[];
  readonly idea: readonly Segment[];
  readonly production: readonly Segment[];
  readonly search: readonly string[];
}

/** The "What really happened" card, with the run's numbers in it. */
export function renderAutopsy(pack: NarrativePack, context: RenderContext): RenderedAutopsy {
  const { autopsy } = pack;
  const render = (source: string) => renderTemplate(source, context);
  return {
    title: render(autopsy.title),
    town: render(autopsy.town),
    tempting: render(autopsy.tempting),
    idea: render(autopsy.idea),
    production: render(autopsy.production),
    search: autopsy.search,
  };
}
