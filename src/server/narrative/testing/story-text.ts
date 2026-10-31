import type { Checkpoint } from "../../engine/puzzle";
import type { CharacterId } from "../../engine/run/types";
import { runBindings, type Bindings, type Voice } from "../bindings";
import { ending } from "../endings";
import { CURSE_FLAVOR, RELIC_FLAVOR } from "../flavor";
import { clearedScene, introScene, renderAutopsy, renderCallouts } from "../hour";
import { NARRATIVE_PACKS } from "../packs";
import { LEDGER_PAGES } from "../pages";
import { OWNER_LOST_CANDLE, WREN_BOSS_COST, WREN_ONE_LEFT, characterRunStart } from "../reactions";
import { plainText, renderScene, renderTemplate, type RenderContext } from "../render";
import { placeholdersOf } from "../template";
import type { BindingKind, Line, NarrativePack, Scene, Speaker } from "../types";
import {
  OLD_WREN_PAGE_ONE,
  PAGE_REACTION_TOO_EARLY,
  PAGE_REACTIONS,
  WREN_LINES,
  type WrenStage,
} from "../wren";

/** A voice for every character, at the stages where how they're spoken to changes. */
export const VOICES: readonly Voice[] = [
  ...(["intern", "night_clerk", "purist"] satisfies CharacterId[]).flatMap((character) =>
    (["W0", "W2", "W3", "W6"] satisfies WrenStage[]).map((stage): Voice => ({ character, stage })),
  ),
  { character: "old_wren", stage: "OW" },
];

export const FIXTURE_CHECKPOINTS: readonly Checkpoint[] = [
  { id: "a", afterBatch: 0, label: "19:00" },
  { id: "b", afterBatch: 1, label: "19:15" },
  { id: "c", afterBatch: 2, label: "19:30" },
];

/** Shared bindings for a moment late in an hour, after a candle went out. */
export function fixtureRunBindings(checkpoints = FIXTURE_CHECKPOINTS, retention = 3): Bindings {
  const failed = checkpoints.at(-1);
  if (!failed) throw new Error("A fixture hour has checkpoints.");
  return {
    ...runBindings({
      seed: "raven-pumpkin-13",
      character: "intern",
      candles: 2,
      retention,
      checkpoints,
      clock: "19:10",
      failedCheckpoint: failed,
    }),
    shown_value: 412,
  };
}

const FIXTURE_VALUES: Readonly<Record<BindingKind, (count: number) => string | number>> = {
  count: (count) => count,
  name: () => "Cobweb Court",
  time: () => "2026-11-01 01:30:00-05:00",
};

/** Stand-in values for a pack's own bindings, for packs whose generator doesn't exist yet. */
export function fixturePackBindings(pack: NarrativePack, count: number): Bindings {
  return Object.fromEntries(
    Object.entries(pack.bindings).map(([key, kind]) => [key, FIXTURE_VALUES[kind](count)]),
  );
}

/** Every scene a pack can show, whatever the data or the voice. */
export function packScenes(pack: NarrativePack): Scene[] {
  return [
    pack.intro,
    pack.oldWrenIntro ?? [],
    pack.cleared,
    pack.clearedIfNone?.scene ?? [],
    pack.clearedAfterHollow ?? [],
    pack.hook,
  ];
}

export function autopsyTemplates(pack: NarrativePack): string[] {
  const { title, town, tempting, idea, production } = pack.autopsy;
  return [title, town, tempting, idea, production];
}

export function calloutTemplates(pack: NarrativePack): string[] {
  return (pack.tutorial ?? []).map((callout) => callout.text);
}

/** Every template a pack holds, fog variants included. */
export function packTemplates(pack: NarrativePack): string[] {
  return packScenes(pack)
    .flat()
    .flatMap((line) => (line.fog === undefined ? [line.text] : [line.text, line.fog]))
    .concat(calloutTemplates(pack), autopsyTemplates(pack), pack.epitaphs);
}

/** The symptoms a pack's lines hold: what the Curse of the Fog would take. */
export function packSymptoms(pack: NarrativePack): string[] {
  const names = packTemplates(pack).flatMap((source) =>
    placeholdersOf(source)
      .filter((slot) => slot.symptom)
      .map((slot) => slot.name),
  );
  return [...new Set(names)].sort();
}

/**
 * Renders everything a player could read from one pack, in every voice, as plain text. Any
 * missing binding throws, which is the point.
 */
export function renderPack(pack: NarrativePack, context: RenderContext): string[] {
  const texts: string[] = [];
  for (const voice of VOICES) {
    const scenes = [
      introScene(pack, voice),
      clearedScene(pack, context.bindings, voice),
      ...packScenes(pack),
    ];
    for (const scene of scenes) {
      texts.push(...renderScene(scene, context, voice).map((line) => plainText(line.segments)));
    }
  }
  for (const when of ["tour", "first-break"] as const) {
    texts.push(...renderCallouts(pack, context, when).map((c) => plainText(c.segments)));
  }
  const autopsy = renderAutopsy(pack, context);
  texts.push(
    ...[autopsy.title, autopsy.town, autopsy.tempting, autopsy.idea, autopsy.production].map(
      plainText,
    ),
  );
  texts.push(...pack.epitaphs.map((source) => plainText(renderTemplate(source, context))));
  return texts;
}

/** A piece of story text, labelled by what kind of thing it is, for the writing-bar checks. */
export interface StoryString {
  readonly where: string;
  readonly kind: "beat" | "callout" | "autopsy" | "ending" | "fixed";
  readonly speaker: Speaker | null;
  readonly source: string;
}

const fromLines = (where: string, kind: StoryString["kind"], lines: readonly Line[]) =>
  lines.flatMap((line): StoryString[] =>
    [line.text, ...(line.fog === undefined ? [] : [line.fog])].map((source) => ({
      where,
      kind,
      speaker: line.speaker,
      source,
    })),
  );

/** Every string of story the game ships. */
export function allStoryStrings(): StoryString[] {
  const strings: StoryString[] = [];
  for (const pack of NARRATIVE_PACKS) {
    strings.push(...fromLines(pack.puzzleId, "beat", packScenes(pack).flat()));
    strings.push(
      ...(pack.tutorial ?? []).map((callout) => ({
        where: `${pack.puzzleId} callout ${callout.id}`,
        kind: "callout" as const,
        speaker: null,
        source: callout.text,
      })),
    );
    strings.push(
      ...autopsyTemplates(pack).map((source) => ({
        where: `${pack.puzzleId} autopsy`,
        kind: "autopsy" as const,
        speaker: null,
        source,
      })),
      ...pack.epitaphs.map((source) => ({
        where: `${pack.puzzleId} epitaph`,
        kind: "fixed" as const,
        speaker: null,
        source,
      })),
    );
  }
  for (const [owner, lines] of Object.entries(OWNER_LOST_CANDLE)) {
    strings.push(...fromLines(`lost candle (${owner})`, "beat", lines));
  }
  strings.push(...fromLines("lost candle (Wren)", "beat", [WREN_ONE_LEFT, WREN_BOSS_COST]));
  for (const [stage, lines] of Object.entries(WREN_LINES)) {
    strings.push(...fromLines(`Wren ${stage}`, "beat", Object.values(lines)));
  }
  strings.push(
    ...fromLines("page reactions", "beat", [
      ...Object.values(PAGE_REACTIONS),
      PAGE_REACTION_TOO_EARLY,
      OLD_WREN_PAGE_ONE,
    ]),
  );
  for (const id of ["act-1", "act-2", "act-3", "true"] as const) {
    for (const pages of [0, 3]) {
      strings.push(...fromLines(`ending ${id}`, "ending", ending(id, pages).scene));
    }
  }
  for (const voice of VOICES) {
    strings.push(
      ...fromLines(
        `run start (${voice.character})`,
        "fixed",
        characterRunStart(voice.character, voice.stage),
      ),
    );
  }
  for (const flavor of [...Object.values(RELIC_FLAVOR), ...Object.values(CURSE_FLAVOR)]) {
    strings.push(
      ...[flavor.name, flavor.flavor, flavor.effect].map((source) => ({
        where: flavor.name,
        kind: "fixed" as const,
        speaker: null,
        source,
      })),
    );
  }
  for (const page of Object.values(LEDGER_PAGES)) {
    strings.push({
      where: `page ${page.numeral}`,
      kind: "fixed",
      speaker: null,
      source: page.text,
    });
  }
  return strings;
}
