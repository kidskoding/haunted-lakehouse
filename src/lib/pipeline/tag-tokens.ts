/** A token inside a template tag. `start` is its index in the model file. */
export type TagToken =
  | { readonly kind: "ident"; readonly value: string; readonly start: number }
  | { readonly kind: "string"; readonly value: string; readonly start: number }
  | { readonly kind: "punct"; readonly value: string; readonly start: number };

export type TokenizeResult =
  | { readonly ok: true; readonly tokens: readonly TagToken[] }
  | { readonly ok: false; readonly message: string; readonly at: number };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const PUNCT = new Set(["(", ")", ",", "=", "[", "]"]);

/**
 * Splits the text between a tag's delimiters into identifiers, quoted strings, and the
 * punctuation the tag grammar uses (runtime contract 2.2 and 2.3). Strings have no escapes:
 * a string ends at the next quote of the kind that opened it.
 */
export function tokenizeTag(content: string, offset: number): TokenizeResult {
  const tokens: TagToken[] = [];
  let i = 0;
  while (i < content.length) {
    const char = content.charAt(i);
    const start = offset + i;
    if (/\s/.test(char)) {
      i++;
    } else if (IDENT_START.test(char)) {
      let end = i + 1;
      while (end < content.length && IDENT_PART.test(content.charAt(end))) end++;
      tokens.push({ kind: "ident", value: content.slice(i, end), start });
      i = end;
    } else if (char === "'" || char === '"') {
      const end = content.indexOf(char, i + 1);
      if (end === -1) return { ok: false, message: `The string is never closed.`, at: start };
      tokens.push({ kind: "string", value: content.slice(i + 1, end), start });
      i = end + 1;
    } else if (PUNCT.has(char)) {
      tokens.push({ kind: "punct", value: char, start });
      i++;
    } else {
      return { ok: false, message: `Unexpected \`${char}\`.`, at: start };
    }
  }
  return { ok: true, tokens };
}

/** Reads tokens front to back, for the small recursive-descent parsers of tag contents. */
export class TokenCursor {
  private index = 0;

  constructor(
    private readonly tokens: readonly TagToken[],
    private readonly end: number,
  ) {}

  peek(): TagToken | undefined {
    return this.tokens[this.index];
  }

  next(): TagToken | undefined {
    const token = this.tokens[this.index];
    if (token) this.index++;
    return token;
  }

  /** Consumes the token if it is this punctuation or identifier. */
  accept(kind: "punct" | "ident", value: string): boolean {
    const token = this.peek();
    if (token?.kind !== kind || token.value !== value) return false;
    this.index++;
    return true;
  }

  atEnd(): boolean {
    return this.index >= this.tokens.length;
  }

  /** Where the next token starts, or the end of the tag when none is left. */
  position(): number {
    return this.peek()?.start ?? this.end;
  }
}
