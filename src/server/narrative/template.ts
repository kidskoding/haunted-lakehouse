import "server-only";

/*
 * Story text is written in a tiny template language, so every number the player reads is
 * bound from their run instead of typed into a sentence.
 *
 *   {name}              a binding, formatted by its type
 *   {*name}             a symptom: the Curse of the Fog may withhold it
 *   {name|number}       1,234
 *   {name|word}         "three" up to twenty, digits after; `Word` capitalizes
 *   {name|plural:a,b}   "1 house", "4 houses"
 *   {name|words:a,b}    "one batch", "three batches"
 *   {name|clock}        "7:00pm", or "the first 1:30am" in the hour that repeats
 *   *em*  **strong**  `code`, and a backslash escapes any of {}*`\
 *
 * Parsing is all it does: no expressions, no lookups, nothing that could run.
 */

export type Style = "plain" | "em" | "strong" | "code";

export type Format =
  | { readonly kind: "number" }
  | { readonly kind: "word"; readonly capital: boolean }
  | { readonly kind: "plural"; readonly one: string; readonly many: string }
  | { readonly kind: "words"; readonly one: string; readonly many: string }
  | { readonly kind: "clock" };

export interface TextNode {
  readonly kind: "text";
  readonly text: string;
  readonly style: Style;
}

export interface SlotNode {
  readonly kind: "slot";
  readonly name: string;
  /** A symptom number, which the Curse of the Fog may withhold. */
  readonly symptom: boolean;
  readonly format: Format | null;
  readonly style: Style;
}

export type TemplateNode = TextNode | SlotNode;

export class TemplateError extends Error {
  override name = "TemplateError";
}

const SLOT = /^(\*)?([A-Za-z][A-Za-z0-9_]*)(?:\|([A-Za-z]+)(?::(.*))?)?$/;
const ESCAPABLE = "{}*`\\";

function parseFormat(name: string, args: string | undefined, source: string): Format {
  const bare = (format: Format): Format => {
    if (args !== undefined) throw new TemplateError(`${name} takes no arguments in "${source}".`);
    return format;
  };
  switch (name) {
    case "number":
      return bare({ kind: "number" });
    case "word":
      return bare({ kind: "word", capital: false });
    case "Word":
      return bare({ kind: "word", capital: true });
    case "clock":
      return bare({ kind: "clock" });
    case "plural":
    case "words": {
      const forms = args?.split(",") ?? [];
      const [one, many] = forms;
      if (forms.length !== 2 || !one || !many) {
        throw new TemplateError(
          `${name} needs two forms, like ${name}:house,houses, in "${source}".`,
        );
      }
      return { kind: name, one, many };
    }
    default:
      throw new TemplateError(`Unknown format "${name}" in "${source}".`);
  }
}

function parseSlot(inner: string, style: Style, source: string): SlotNode {
  const match = SLOT.exec(inner);
  if (!match) throw new TemplateError(`"{${inner}}" is not a placeholder, in "${source}".`);
  const [, star, name = "", format, args] = match;
  return {
    kind: "slot",
    name,
    symptom: star !== undefined,
    format: format === undefined ? null : parseFormat(format, args, source),
    style,
  };
}

function markerAt(source: string, i: number): Exclude<Style, "plain"> | null {
  const ch = source.charAt(i);
  if (ch === "`") return "code";
  if (ch !== "*") return null;
  return source.charAt(i + 1) === "*" ? "strong" : "em";
}

/** Parses a template into text and placeholder nodes, rejecting anything it can't read exactly. */
export function parseTemplate(source: string): readonly TemplateNode[] {
  const nodes: TemplateNode[] = [];
  let style: Style = "plain";
  let text = "";
  const flush = () => {
    if (text !== "") nodes.push({ kind: "text", text, style });
    text = "";
  };

  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === "\\") {
      const next = source.charAt(i + 1);
      if (!ESCAPABLE.includes(next) || next === "") {
        throw new TemplateError(`A backslash must escape one of ${ESCAPABLE} in "${source}".`);
      }
      text += next;
      i += 2;
      continue;
    }
    if (ch === "{") {
      const end = source.indexOf("}", i);
      if (end < 0) throw new TemplateError(`A placeholder never closes in "${source}".`);
      flush();
      nodes.push(parseSlot(source.slice(i + 1, end), style, source));
      i = end + 1;
      continue;
    }
    if (ch === "}") throw new TemplateError(`A stray "}" in "${source}".`);

    const marker = markerAt(source, i);
    // Inside code, asterisks are just asterisks.
    if (marker !== null && (style !== "code" || marker === "code")) {
      flush();
      if (style === marker) style = "plain";
      else if (style === "plain") style = marker;
      else throw new TemplateError(`*${marker}* opens inside *${style}* in "${source}".`);
      i += marker === "strong" ? 2 : 1;
      continue;
    }
    text += ch;
    i += 1;
  }
  if (style !== "plain") throw new TemplateError(`*${style}* never closes in "${source}".`);
  flush();
  return nodes;
}

/** The placeholders a template uses, in order of appearance. */
export function placeholdersOf(source: string): readonly SlotNode[] {
  return parseTemplate(source).filter((node): node is SlotNode => node.kind === "slot");
}
