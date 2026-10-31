import { DEFAULT_CONFIG, parseConfig, type ConfigRules, type ModelConfig } from "./parse-config";
import { tokenizeTag, type TagToken } from "./tag-tokens";
import type { CompileErrorCode } from "./types";

/**
 * One piece of a model file after the template pass. `start` and `end` are indices in the
 * file, so errors and rendered SQL can point back at what the player wrote.
 */
export type Piece =
  | { readonly kind: "text"; readonly text: string; readonly start: number }
  | { readonly kind: "this"; readonly start: number; readonly end: number }
  | {
      readonly kind: "new_batch";
      readonly feed: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: "if";
      readonly then: readonly Piece[];
      readonly otherwise: readonly Piece[];
      readonly start: number;
      readonly end: number;
    };

export interface Template {
  readonly config: ModelConfig;
  readonly pieces: readonly Piece[];
}

export interface TemplateError {
  readonly code: CompileErrorCode;
  readonly message: string;
  readonly at: number;
}

export type TemplateResult =
  | { readonly ok: true; readonly template: Template }
  | { readonly ok: false; readonly error: TemplateError };

const TAGS_HELP =
  "The tags are {{ config(...) }}, {{ this }}, {{ new_batch('feed') }}, and " +
  "{% if is_incremental() %} ... {% else %} ... {% endif %}.";

const TAG_LABELS: Record<Exclude<Piece["kind"], "text">, string> = {
  this: "`{{ this }}`",
  new_batch: "`{{ new_batch(...) }}`",
  if: "`{% if is_incremental() %}`",
};

/** Only whitespace and `--` line comments may come before the config call. */
const CONFIG_PREAMBLE = /^(?:\s|--[^\n]*)*$/;

interface Tag {
  readonly open: "{{" | "{%";
  readonly tokens: readonly TagToken[];
  readonly content: string;
  readonly start: number;
  readonly end: number;
}

interface IfFrame {
  readonly start: number;
  readonly then: Piece[];
  otherwise: Piece[] | null;
}

function words(tokens: readonly TagToken[]): string {
  return tokens.map((token) => token.value).join(" ");
}

function isNewBatch(tokens: readonly TagToken[]): boolean {
  return (
    tokens.length === 4 &&
    tokens[0]?.value === "new_batch" &&
    tokens[1]?.value === "(" &&
    tokens[2]?.kind === "string" &&
    tokens[3]?.value === ")"
  );
}

function strayCloser(text: string): number {
  const indices = [text.indexOf("}}"), text.indexOf("%}")].filter((i) => i !== -1);
  return indices.length === 0 ? -1 : Math.min(...indices);
}

/** Builds the piece list while tracking the single level of `if` the grammar allows. */
class Builder {
  readonly top: Piece[] = [];
  frame: IfFrame | null = null;
  config: ModelConfig | null = null;

  push(piece: Piece): void {
    const target = this.frame ? (this.frame.otherwise ?? this.frame.then) : this.top;
    target.push(piece);
  }

  control(tag: Tag): TemplateError | null {
    const text = words(tag.tokens);
    const fail = (message: string): TemplateError => ({
      code: "template_syntax",
      message,
      at: tag.start,
    });
    if (text === "if is_incremental ( )") {
      if (this.frame) return fail("`{% if %}` blocks cannot nest.");
      this.frame = { start: tag.start, then: [], otherwise: null };
      return null;
    }
    if (text === "else") {
      if (!this.frame) return fail("`{% else %}` has no `{% if is_incremental() %}` before it.");
      if (this.frame.otherwise) return fail("This `{% if %}` block already has an `{% else %}`.");
      this.frame.otherwise = [];
      return null;
    }
    if (text === "endif") {
      const frame = this.frame;
      if (!frame) return fail("`{% endif %}` has no `{% if is_incremental() %}` before it.");
      this.frame = null;
      this.top.push({
        kind: "if",
        then: frame.then,
        otherwise: frame.otherwise ?? [],
        start: frame.start,
        end: tag.end,
      });
      return null;
    }
    return {
      code: "unknown_tag",
      message: `Unknown tag \`{%${tag.content}%}\`. ${TAGS_HELP}`,
      at: tag.start,
    };
  }

  expression(tag: Tag, source: string, rules: ConfigRules): TemplateError | null {
    const [first] = tag.tokens;
    if (first?.kind === "ident" && first.value === "config") {
      if (this.config) {
        return { code: "config_duplicate", message: "A model has one config call.", at: tag.start };
      }
      if (!CONFIG_PREAMBLE.test(source.slice(0, tag.start))) {
        return {
          code: "config_position",
          message: "The config call must come first, before any SQL.",
          at: tag.start,
        };
      }
      const parsed = parseConfig(tag.tokens, tag.end - 2, rules);
      if (!parsed.ok) return parsed.error;
      this.config = parsed.config;
      return null;
    }
    if (tag.tokens.length === 1 && first?.kind === "ident" && first.value === "this") {
      this.push({ kind: "this", start: tag.start, end: tag.end });
      return null;
    }
    const feed = tag.tokens[2];
    if (isNewBatch(tag.tokens) && feed) {
      // Feed names are identifiers, matched case-insensitively like `bronze.<feed>`.
      const name = feed.value.toLowerCase();
      this.push({ kind: "new_batch", feed: name, start: tag.start, end: tag.end });
      return null;
    }
    return {
      code: "unknown_tag",
      message: `Unknown tag \`{{${tag.content}}}\`. ${TAGS_HELP}`,
      at: tag.start,
    };
  }
}

function readTag(source: string, open: number): Tag | TemplateError {
  const opener = source.startsWith("{{", open) ? "{{" : "{%";
  const closer = opener === "{{" ? "}}" : "%}";
  const close = source.indexOf(closer, open + 2);
  if (close === -1) {
    return { code: "template_syntax", message: `\`${opener}\` is never closed.`, at: open };
  }
  const content = source.slice(open + 2, close);
  const tokenized = tokenizeTag(content, open + 2);
  if (!tokenized.ok) {
    return { code: "template_syntax", message: tokenized.message, at: tokenized.at };
  }
  return { open: opener, tokens: tokenized.tokens, content, start: open, end: close + 2 };
}

function nextOpen(source: string, from: number): number {
  const indices = [source.indexOf("{{", from), source.indexOf("{%", from)].filter((i) => i !== -1);
  return indices.length === 0 ? -1 : Math.min(...indices);
}

type TagPiece = Exclude<Piece, { readonly kind: "text" }>;

function* tagPieces(pieces: readonly Piece[]): Generator<TagPiece> {
  for (const piece of pieces) {
    if (piece.kind === "if") {
      yield piece;
      yield* tagPieces(piece.then);
      yield* tagPieces(piece.otherwise);
    } else if (piece.kind !== "text") {
      yield piece;
    }
  }
}

/** Tags that only make sense for incremental models, and `{{ this }}` read on the first step. */
function checkTagUse(template: Template): TemplateError | null {
  if (template.config.materialization !== "incremental") {
    const [tag] = tagPieces(template.pieces);
    if (tag) {
      return {
        code: "incremental_only",
        message: `Only materialized='incremental' models can use ${TAG_LABELS[tag.kind]}.`,
        at: tag.start,
      };
    }
  }
  const firstRun = template.pieces.flatMap((piece) =>
    piece.kind === "if" ? piece.otherwise : [piece],
  );
  const stateRead = firstRun.find((piece) => piece.kind === "this");
  if (stateRead) {
    return {
      code: "this_on_first_run",
      message:
        "`{{ this }}` has no state on the first batch; read it only inside " +
        "`{% if is_incremental() %}`.",
      at: stateRead.start,
    };
  }
  return null;
}

/**
 * The lexical template pass of the runtime contract (2.2, 2.3): finds every `{{ }}` and
 * `{% %}` tag, wherever it is, reads the config call, and returns the file as text and tag
 * pieces ready to render. Tag contents are validated here; feed names are checked later
 * against the town's feeds.
 */
export function parseTemplate(source: string, rules: ConfigRules): TemplateResult {
  const builder = new Builder();
  let index = 0;
  for (;;) {
    const open = nextOpen(source, index);
    const text = source.slice(index, open === -1 ? source.length : open);
    const stray = strayCloser(text);
    if (stray !== -1) {
      return {
        ok: false,
        error: {
          code: "leftover_delimiter",
          message: `\`${text.slice(stray, stray + 2)}\` closes a tag that was never opened.`,
          at: index + stray,
        },
      };
    }
    if (text !== "") builder.push({ kind: "text", text, start: index });
    if (open === -1) break;

    const tag = readTag(source, open);
    if ("code" in tag) return { ok: false, error: tag };
    const error = tag.open === "{%" ? builder.control(tag) : builder.expression(tag, source, rules);
    if (error) return { ok: false, error };
    index = tag.end;
  }
  if (builder.frame) {
    return {
      ok: false,
      error: {
        code: "template_syntax",
        message: "`{% if is_incremental() %}` is never closed with `{% endif %}`.",
        at: builder.frame.start,
      },
    };
  }
  const template: Template = { config: builder.config ?? DEFAULT_CONFIG, pieces: builder.top };
  const misuse = checkTagUse(template);
  return misuse ? { ok: false, error: misuse } : { ok: true, template };
}
