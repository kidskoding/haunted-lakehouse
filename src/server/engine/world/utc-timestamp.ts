import "server-only";

const SECONDS_PER_DAY = 86_400;

/**
 * The proleptic Gregorian date of a day count since 1970-01-01 (Howard Hinnant's
 * `civil_from_days`). Plain integer arithmetic, so generation never touches `Date` or a zone.
 */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * Unix seconds as a zone-less UTC timestamp in DuckDB's TIMESTAMP text form,
 * `YYYY-MM-DD HH:MM:SS`, which casts losslessly in every engine the game targets.
 */
export function formatUtcTimestamp(epochSeconds: number): string {
  if (!Number.isSafeInteger(epochSeconds)) {
    throw new RangeError(`Expected whole seconds, got ${String(epochSeconds)}.`);
  }
  const days = Math.floor(epochSeconds / SECONDS_PER_DAY);
  const secondOfDay = epochSeconds - days * SECONDS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(secondOfDay / 3600);
  const minute = Math.floor((secondOfDay % 3600) / 60);
  const second = secondOfDay % 60;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
