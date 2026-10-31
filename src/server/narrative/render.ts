import "server-only";
import { addressFor, type Bindings, type Voice } from "./bindings";
import { formatClock, formatNumber, numberWord, plural, pluralWords } from "./format";
import type { RenderedLine, Segment } from "../../lib/story/types";
import { parseTemplate, placeholdersOf, type Format } from "./template";
import type { Line, Scene } from "./types";

// The rendered shapes live in lib so the client can share them without the engine.
export type { RenderedLine, Segment };

export interface RenderContext {
  readonly bindings: Bindings;
  /** Keys the Curse of the Fog took. They render as fog; any other missing key is a bug. */
  readonly withheld: readonly string[];
}

export class NarrativeError extends Error {
  override name = "NarrativeError";
}

function fogText(format: Format | null): string {
  return format?.kind === "clock" ? "a time lost in the fog" : "a number lost in the fog";
}

function formatValue(key: string, value: string | number, format: Format | null): string {
  const needNumber = (): number => {
    if (typeof value !== "number") throw new NarrativeError(`${key} must be a number.`);
    return value;
  };
  if (format === null) return typeof value === "number" ? formatNumber(value) : value;
  switch (format.kind) {
    case "number":
      return formatNumber(needNumber());
    case "word":
      return numberWord(needNumber(), format.capital);
    case "plural":
      return plural(needNumber(), format.one, format.many);
    case "words":
      return pluralWords(needNumber(), format.one, format.many);
    case "clock":
      if (typeof value !== "string") throw new NarrativeError(`${key} must be a time.`);
      return formatClock(value);
  }
}

/**
 * Renders one template. A placeholder with no binding throws, unless the fog withheld it, so
 * a story can never ship with a hole in it.
 */
export function renderTemplate(source: string, context: RenderContext): Segment[] {
  return parseTemplate(source).map((node): Segment => {
    if (node.kind === "text") return node;
    const { name: key, format, style } = node;
    if (context.withheld.includes(key)) return { kind: "fog", key, text: fogText(format), style };
    const value = context.bindings[key];
    if (value === undefined) throw new NarrativeError(`Nothing is bound to {${key}}: "${source}"`);
    return { kind: "value", key, text: formatValue(key, value, format), style };
  });
}

/** The template a line shows: its fog version when the fog took any of its symptoms. */
export function lineTemplate(line: Line, withheld: readonly string[]): string {
  if (line.fog === undefined) return line.text;
  const fogged = placeholdersOf(line.text).some(
    (slot) => slot.symptom && withheld.includes(slot.name),
  );
  return fogged ? line.fog : line.text;
}

export function renderLine(line: Line, context: RenderContext, voice: Voice): RenderedLine {
  const bindings = { ...context.bindings, you: addressFor(line.speaker, voice) };
  return {
    speaker: line.speaker,
    thought: line.speaker === "wren" && voice.character === "old_wren",
    segments: renderTemplate(lineTemplate(line, context.withheld), { ...context, bindings }),
  };
}

export function renderScene(scene: Scene, context: RenderContext, voice: Voice): RenderedLine[] {
  return scene.map((line) => renderLine(line, context, voice));
}

/** The words alone, for tests, alt text, and share cards. */
export function plainText(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join("");
}
