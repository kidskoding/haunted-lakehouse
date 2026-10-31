import "server-only";

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

/** Groups thousands with commas, by hand, so output never depends on the runtime's locale. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`${String(value)} is not a number to print.`);
  const [whole = "", fraction] = String(Math.abs(value)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

/** Small whole numbers as words, the way the town says them; anything else as digits. */
export function numberWord(value: number, capital = false): string {
  const word = Number.isInteger(value) && value >= 0 ? WORDS[value] : undefined;
  if (word === undefined) return formatNumber(value);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** "1 house", "4 houses". */
export function plural(value: number, one: string, many: string): string {
  return `${formatNumber(value)} ${value === 1 ? one : many}`;
}

/** "one batch", "three batches". */
export function pluralWords(value: number, one: string, many: string): string {
  return `${numberWord(value)} ${value === 1 ? one : many}`;
}

// Optional date, HH:MM, optional seconds, optional offset.
const CLOCK = /^(?:(2026-10-31|2026-11-01)[ T])?(\d{2}):(\d{2})(?::\d{2})?(-05:00|-06:00)?$/;

/**
 * A night time as the town's clocks show it: `19:00` reads "7:00pm". Hollow Creek falls back
 * at 2:00am, so 1:00 to 1:59 happens twice and needs its offset to say which: `01:30-05:00`
 * is "the first 1:30am", `01:30-06:00` "the second 1:30am". A time outside 6pm to 3am, or
 * whose date or offset contradicts it, is a bug in the caller and throws.
 */
export function formatClock(text: string): string {
  const match = CLOCK.exec(text);
  if (!match) throw new RangeError(`"${text}" is not a time on the town's clocks.`);
  const [, date, hh = "", mm = "", offset] = match;
  const hour = Number(hh);
  const minute = Number(mm);
  const evening = hour >= 18 && hour <= 23;
  const smallHours = hour <= 2 || (hour === 3 && minute === 0);
  if (minute > 59 || (!evening && !smallHours)) {
    throw new RangeError(`"${text}" is not during Halloween night.`);
  }
  if (date !== undefined && date !== (evening ? "2026-10-31" : "2026-11-01")) {
    throw new RangeError(`"${text}" has the wrong date for its hour.`);
  }

  const face = `${String(hour % 12 || 12)}:${mm}${evening ? "pm" : "am"}`;
  if (hour === 1) {
    if (offset === undefined) throw new RangeError(`"${text}" happens twice tonight; say which.`);
    return `${offset === "-05:00" ? "the first" : "the second"} ${face}`;
  }
  const expected = !evening && hour >= 2 ? "-06:00" : "-05:00";
  if (offset !== undefined && offset !== expected) {
    throw new RangeError(`"${text}" has an offset the town's clocks never showed at that hour.`);
  }
  return face;
}

/** "7:00pm", "7:00pm and 7:15pm", "7:00pm, 7:15pm and 7:30pm". */
export function listOf(items: readonly string[]): string {
  if (items.length === 0) throw new RangeError("An empty list has nothing to say.");
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
