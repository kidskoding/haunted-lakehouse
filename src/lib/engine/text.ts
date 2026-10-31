/**
 * DuckDB's text form for values Arrow hands to JavaScript in a lossy or opaque shape. Each
 * function matches what `CAST(x AS VARCHAR)` prints, so the results grid shows the player
 * exactly what DuckDB would.
 */

/** Arrow's time units, as its schema numbers them. */
export const TimeUnit = { second: 0, millisecond: 1, microsecond: 2, nanosecond: 3 } as const;
export type TimeUnit = (typeof TimeUnit)[keyof typeof TimeUnit];

const UNIT_PER_SECOND: Readonly<Record<TimeUnit, bigint>> = {
  [TimeUnit.second]: 1n,
  [TimeUnit.millisecond]: 1_000n,
  [TimeUnit.microsecond]: 1_000_000n,
  [TimeUnit.nanosecond]: 1_000_000_000n,
};

const UNIT_DIGITS: Readonly<Record<TimeUnit, number>> = {
  [TimeUnit.second]: 0,
  [TimeUnit.millisecond]: 3,
  [TimeUnit.microsecond]: 6,
  [TimeUnit.nanosecond]: 9,
};

// DuckDB stores ±infinity as the extreme representable values.
const DATE_INFINITY = 2_147_483_647;
const TIMESTAMP_INFINITY = 9_223_372_036_854_775_807n;

const MICROS_PER_SECOND = 1_000_000n;
const MICROS_PER_MINUTE = 60n * MICROS_PER_SECOND;
const MICROS_PER_HOUR = 60n * MICROS_PER_MINUTE;

function pad(value: number | bigint, width: number): string {
  return String(value).padStart(width, "0");
}

function floorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? quotient - 1n : quotient;
}

/** A fraction of a second, without trailing zeros, or nothing when it is zero. */
function fraction(units: bigint, digits: number): string {
  if (units === 0n) return "";
  return `.${pad(units, digits).replace(/0+$/, "")}`;
}

/** The proleptic Gregorian date `days` after 1970-01-01, where year 0 is 1 BC. */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  // Howard Hinnant's days_from_civil inverse: exact for every date DuckDB can store.
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

function datePart(days: number): { text: string; bc: boolean } {
  const { year, month, day } = civilFromDays(days);
  const bc = year <= 0;
  return { text: `${pad(bc ? 1 - year : year, 4)}-${pad(month, 2)}-${pad(day, 2)}`, bc };
}

/** A DATE stored as days since the epoch. */
export function formatDate(days: number): string {
  if (days === DATE_INFINITY) return "infinity";
  if (days === -DATE_INFINITY) return "-infinity";
  const { text, bc } = datePart(days);
  return bc ? `${text} (BC)` : text;
}

/** A time of day, `units` after midnight. */
export function formatTime(units: bigint, unit: TimeUnit): string {
  const perSecond = UNIT_PER_SECOND[unit];
  const seconds = units / perSecond;
  return `${pad(seconds / 3600n, 2)}:${pad((seconds / 60n) % 60n, 2)}:${pad(seconds % 60n, 2)}${fraction(
    units % perSecond,
    UNIT_DIGITS[unit],
  )}`;
}

/** A TIMESTAMP stored as `unit`s since the epoch; zoned ones print in UTC, as DuckDB does without ICU. */
export function formatTimestamp(value: bigint, unit: TimeUnit, zoned: boolean): string {
  if (value === TIMESTAMP_INFINITY) return "infinity";
  if (value === -TIMESTAMP_INFINITY) return "-infinity";
  const perDay = UNIT_PER_SECOND[unit] * 86_400n;
  const days = floorDiv(value, perDay);
  const { text, bc } = datePart(Number(days));
  const time = formatTime(value - days * perDay, unit);
  return `${text}${bc ? " (BC)" : ""} ${time}${zoned ? "+00" : ""}`;
}

/** A DECIMAL from its unscaled integer and scale. */
export function formatDecimal(unscaled: bigint, scale: number): string {
  const negative = unscaled < 0n;
  const digits = String(negative ? -unscaled : unscaled).padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const text = scale === 0 ? whole : `${whole}.${digits.slice(digits.length - scale)}`;
  return negative ? `-${text}` : text;
}

function plural(count: bigint, unit: string): string {
  return `${String(count)} ${unit}${count === 1n || count === -1n ? "" : "s"}`;
}

/** An INTERVAL from its three independent parts, as DuckDB stores it. */
export function formatInterval(months: number, days: number, micros: bigint): string {
  const parts: string[] = [];
  const years = Math.trunc(months / 12);
  const restMonths = months - years * 12;
  if (years !== 0) parts.push(plural(BigInt(years), "year"));
  if (restMonths !== 0) parts.push(plural(BigInt(restMonths), "month"));
  if (days !== 0) parts.push(plural(BigInt(days), "day"));
  if (micros !== 0n) {
    const sign = micros < 0n ? "-" : "";
    const rest = micros < 0n ? -micros : micros;
    const hours = rest / MICROS_PER_HOUR;
    const minutes = (rest % MICROS_PER_HOUR) / MICROS_PER_MINUTE;
    const seconds = (rest % MICROS_PER_MINUTE) / MICROS_PER_SECOND;
    parts.push(
      `${sign}${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${fraction(rest % MICROS_PER_SECOND, 6)}`,
    );
  }
  return parts.length === 0 ? "00:00:00" : parts.join(" ");
}

/** A BLOB: printable ASCII as itself, every other byte (and the backslash) as `\xHH`. */
export function formatBlob(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text +=
      byte >= 0x20 && byte <= 0x7e && byte !== 0x5c
        ? String.fromCharCode(byte)
        : `\\x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return text;
}
