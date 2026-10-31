type TokenKind = "word" | "string" | "number" | "tag" | "comment" | "block" | "punct" | "op";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /** A line break came between this token and the one before it. */
  readonly ownLine: boolean;
}

/**
 * Reserved words, lowercased on output. Only words that cannot name an output column without
 * quotes: DuckDB keeps an alias's case in result column names, so changing an identifier's case
 * could change a gold table.
 */
const RESERVED = new Set(
  (
    "select from where group by having qualify order limit with as on using join union all " +
    "intersect except distinct and or not in is null true false between like ilike exists case " +
    "when then else end over asc desc recursive"
  ).split(" "),
);

/** Words after which `(` opens a group rather than a call, so it takes a space. */
const SPACED_BEFORE_PAREN = new Set([...RESERVED, "filter", "values", "partition"]);

/** Words that join with each other into one `join` keyword: `left outer join`. */
const JOIN_WORDS = new Set([
  "left",
  "right",
  "full",
  "inner",
  "outer",
  "cross",
  "natural",
  "asof",
  "positional",
  "anti",
  "semi",
]);

const OPERATORS = ["->>", "::", "<=", ">=", "<>", "!=", "||", "->", "=>", "==", "**", "//"];

function readUntil(source: string, from: number, close: string): number {
  const end = source.indexOf(close, from);
  return end === -1 ? source.length : end + close.length;
}

function readQuoted(source: string, from: number, quote: string): number {
  let i = from + 1;
  while (i < source.length) {
    if (source[i] === quote) {
      if (source[i + 1] !== quote) return i + 1;
      i++;
    }
    i++;
  }
  return source.length;
}

/** Splits SQL into tokens. Unclosed strings, comments, and tags run to the end of the file. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let ownLine = true;
  while (i < source.length) {
    const char = source.charAt(i);
    if (/\s/.test(char)) {
      if (char === "\n") ownLine = true;
      i++;
      continue;
    }
    const rest = source.slice(i);
    let kind: TokenKind;
    let end: number;
    if (rest.startsWith("--")) [kind, end] = ["comment", readUntil(source, i, "\n")];
    else if (rest.startsWith("/*")) [kind, end] = ["block", readUntil(source, i + 2, "*/")];
    else if (rest.startsWith("{{")) [kind, end] = ["tag", readUntil(source, i + 2, "}}")];
    else if (rest.startsWith("{%")) [kind, end] = ["tag", readUntil(source, i + 2, "%}")];
    else if (char === "'") [kind, end] = ["string", readQuoted(source, i, "'")];
    else if (char === '"') [kind, end] = ["word", readQuoted(source, i, '"')];
    else if (/[A-Za-z_]/.test(char)) {
      [kind, end] = ["word", i + (/^[A-Za-z_][A-Za-z0-9_$]*/.exec(rest)?.[0].length ?? 1)];
    } else if (/\d/.test(char)) {
      [kind, end] = ["number", i + (/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0].length ?? 1)];
    } else if ("(),;.[]".includes(char)) [kind, end] = ["punct", i + 1];
    else [kind, end] = ["op", i + (OPERATORS.find((op) => rest.startsWith(op))?.length ?? 1)];
    // A line comment keeps its text exactly, minus trailing spaces.
    const text = source.slice(i, end).replace(/\s+$/, "");
    tokens.push({ kind, text, ownLine });
    ownLine = false;
    i = end;
  }
  return tokens;
}

/** Builds output lines, applying a requested line break only when the next text arrives. */
class Writer {
  private readonly lines: [number, string][] = [];
  private indent = 0;
  private line = "";
  private pending: number | null = null;
  private blank = false;

  /** The indent of the line being written. */
  get level(): number {
    return this.indent;
  }

  breakTo(indent: number): void {
    if (this.line === "" && this.pending === null) this.indent = indent;
    else this.pending = indent;
  }

  blankLine(): void {
    this.blank = true;
  }

  private flush(): void {
    if (this.pending === null) return;
    this.lines.push([this.indent, this.line]);
    if (this.blank) this.lines.push([0, ""]);
    this.line = "";
    this.indent = this.pending;
    this.pending = null;
    this.blank = false;
  }

  put(text: string, space: boolean): void {
    this.flush();
    if (space && this.line !== "") this.line += " ";
    this.line += text;
  }

  /** A line comment: on its own line if it was written on one, and always ends its line. */
  comment(text: string, ownLine: boolean): void {
    if (ownLine) {
      if (this.pending !== null) this.flush();
      else if (this.line !== "") this.breakTo(this.indent);
      this.flush();
    }
    this.line += (this.line === "" ? "" : " ") + text;
    this.pending ??= this.indent;
  }

  finish(): string {
    if (this.line !== "") this.lines.push([this.indent, this.line]);
    const text = this.lines
      .map(([indent, line]) => (line === "" ? "" : "  ".repeat(indent) + line))
      .join("\n");
    return text === "" ? "" : `${text}\n`;
  }
}

interface Frame {
  /** `call` is a function call or a plain group; `query` holds clauses. */
  readonly kind: "query" | "call";
  readonly level: number;
  /** The indent the frame's closing `)` returns to. */
  readonly close: number;
  clause: string | null;
  /** An open `between`, whose `and` stays inline. */
  between: boolean;
  cases: number;
}

function lower(token: Token | undefined): string {
  return token?.kind === "word" ? token.text.toLowerCase() : "";
}

function isKeyword(token: Token | null, words: ReadonlySet<string>): boolean {
  return token !== null && token.kind === "word" && words.has(token.text.toLowerCase());
}

/** The words of a clause keyword starting at `i`, such as `group by` or `left outer join`. */
function clauseAt(tokens: readonly Token[], i: number): number {
  const word = lower(tokens[i]);
  const nextWord = lower(tokens[i + 1]);
  if ((word === "group" || word === "order") && nextWord === "by") return 2;
  if (word === "union" && nextWord === "all") return 2;
  if (["select", "from", "where", "having", "qualify", "limit", "with", "join"].includes(word)) {
    return 1;
  }
  if (["union", "intersect", "except"].includes(word)) return 1;
  if (JOIN_WORDS.has(word)) {
    let n = 1;
    while (JOIN_WORDS.has(lower(tokens[i + n]))) n++;
    if (lower(tokens[i + n]) === "join") return n + 1;
  }
  return 0;
}

/** Whether the select list starting at `i` has more than one item. */
function hasManyItems(tokens: readonly Token[], i: number): boolean {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const token = tokens[j];
    if (!token || token.kind === "tag" || token.text === ";") return false;
    if (token.text === "(" || token.text === "[") depth++;
    else if (token.text === ")" || token.text === "]") depth--;
    if (depth < 0 || (depth === 0 && clauseAt(tokens, j) > 0)) return false;
    if (depth === 0 && token.text === ",") return true;
  }
  return false;
}

function spaceBefore(prev: Token | null, token: Token, prevUnary: boolean): boolean {
  if (prev === null || prevUnary) return false;
  if (["(", "[", ".", "::"].includes(prev.text)) return false;
  if ([",", ")", "]", ".", ";", "::"].includes(token.text)) return false;
  if (token.text === "(") return !(prev.kind === "word" && !isKeyword(prev, SPACED_BEFORE_PAREN));
  if (token.text === "[") return !(prev.kind === "word" || prev.text === ")" || prev.text === "]");
  return true;
}

function isUnary(prev: Token | null, token: Token): boolean {
  if (token.text !== "-" && token.text !== "+") return false;
  if (prev === null || prev.kind === "op") return true;
  if (prev.kind === "punct") return ["(", ",", "["].includes(prev.text);
  return isKeyword(prev, RESERVED);
}

/**
 * Formats a model file: one clause per line, one selected column per line, `and`/`or`
 * conditions on their own lines, subqueries indented, and reserved words lowercased. Template
 * tags, strings, and comments are kept as written. Formatting is deterministic and formatting
 * the output again changes nothing.
 */
export function formatSql(source: string): string {
  const tokens = tokenize(source);
  const out = new Writer();
  const frames: Frame[] = [
    { kind: "query", level: 0, close: 0, clause: null, between: false, cases: 0 },
  ];
  let prev: Token | null = null;
  let prevUnary = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) break;
    const top = frames[frames.length - 1];
    if (!top) break;
    const word = lower(token);

    if (token.kind === "comment") {
      out.comment(token.text, token.ownLine && prev !== null);
      prev = token;
      continue;
    }
    if (token.kind === "tag") {
      const text = `${token.text.slice(0, 2)} ${token.text.slice(2, -2).trim()} ${token.text.slice(-2)}`;
      const control = token.text.startsWith("{%");
      const config = /^\{\{\s*config\b/.test(token.text);
      if (control || config) out.breakTo(top.level);
      out.put(text, spaceBefore(prev, token, prevUnary));
      if (control || config) out.breakTo(top.level);
      if (config) out.blankLine();
      prev = token;
      prevUnary = false;
      continue;
    }

    const clauseWords = top.kind === "query" ? clauseAt(tokens, i) : 0;
    if (clauseWords > 0) {
      const words = tokens.slice(i, i + clauseWords).map((t) => t.text.toLowerCase());
      const clause = words[words.length - 1] === "join" ? "join" : words.join(" ");
      out.breakTo(top.level);
      out.put(words.join(" "), true);
      i += clauseWords - 1;
      top.clause = clause;
      top.between = false;
      prev = tokens[i] ?? token;
      prevUnary = false;
      if (clause === "select") {
        if (lower(tokens[i + 1]) === "distinct") {
          out.put("distinct", true);
          i++;
        }
        if (hasManyItems(tokens, i + 1)) out.breakTo(top.level + 1);
      }
      continue;
    }

    if (
      (word === "and" || word === "or") &&
      top.kind === "query" &&
      top.cases === 0 &&
      !(word === "and" && top.between) &&
      ["where", "having", "qualify", "join"].includes(top.clause ?? "")
    ) {
      out.breakTo(top.level + 1);
    }

    const unary = isUnary(prev, token);
    if (token.text === ")" && top.kind === "query" && frames.length > 1) out.breakTo(top.close);
    const text = token.kind === "word" && RESERVED.has(word) ? word : token.text;
    out.put(text, spaceBefore(prev, token, prevUnary));

    if (word === "between") top.between = true;
    else if (word === "and") top.between = false;
    else if (word === "case") top.cases++;
    else if (word === "end" && top.cases > 0) top.cases--;
    else if (token.text === "(" || token.text === "[") {
      const next = lower(tokens[i + 1]);
      const subquery = token.text === "(" && (next === "select" || next === "with");
      frames.push({
        kind: subquery ? "query" : "call",
        level: subquery ? out.level + 1 : top.level,
        close: out.level,
        clause: null,
        between: false,
        cases: 0,
      });
    } else if (token.text === ")" || token.text === "]") {
      if (frames.length > 1) frames.pop();
    } else if (token.text === "," && top.kind === "query") {
      if (top.clause === "select") out.breakTo(top.level + 1);
      else if (top.clause === "with") out.breakTo(top.level);
    } else if (token.text === ";") {
      out.breakTo(top.level);
    }
    prev = token;
    prevUnary = unary;
  }
  return out.finish();
}
