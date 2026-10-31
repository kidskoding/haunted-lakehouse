/** A 1-based place in a text, with the column counted in UTF-16 code units as editors do. */
export interface LineColumn {
  readonly line: number;
  readonly column: number;
}

export function lineColumn(text: string, index: number): LineColumn {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/**
 * The string index of a 1-based place in `text`, the inverse of `lineColumn`, or null when the
 * place is not in the text. A column may sit one past the end of its line, where a caret
 * points at a missing token.
 */
export function indexOfLineColumn(text: string, place: LineColumn): number | null {
  if (!Number.isInteger(place.line) || !Number.isInteger(place.column)) return null;
  if (place.line < 1 || place.column < 1) return null;
  let lineStart = 0;
  for (let line = 1; line < place.line; line++) {
    const end = text.indexOf("\n", lineStart);
    if (end < 0) return null;
    lineStart = end + 1;
  }
  const lineEnd = text.indexOf("\n", lineStart);
  const length = (lineEnd < 0 ? text.length : lineEnd) - lineStart;
  return place.column - 1 <= length ? lineStart + place.column - 1 : null;
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Converts an offset counted in some unit per code point into a string index, or null when it
 * lies past the end. DuckDB counts parse-tree locations in UTF-8 bytes and syntax error
 * positions in code points, while JavaScript strings index UTF-16 code units.
 */
function indexOfOffset(
  text: string,
  offset: number,
  unitsOf: (cp: number) => number,
): number | null {
  let units = 0;
  let index = 0;
  for (const char of text) {
    if (units >= offset) return index;
    const cp = char.codePointAt(0) ?? 0;
    units += unitsOf(cp);
    index += char.length;
  }
  return units >= offset ? index : null;
}

export function indexOfUtf8Offset(text: string, bytes: number): number | null {
  return indexOfOffset(text, bytes, utf8Length);
}

export function indexOfCodePointOffset(text: string, codePoints: number): number | null {
  return indexOfOffset(text, codePoints, () => 1);
}
