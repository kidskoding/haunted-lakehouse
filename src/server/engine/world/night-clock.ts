import "server-only";

/*
 * Hollow Creek keeps US Central time, and the night is Halloween 2026: Saturday Oct 31 at
 * 18:00 CDT (UTC-5) to Sunday Nov 1 at 03:00 CST (UTC-6). At 02:00 CDT the clocks fall back
 * to 01:00 CST, so local 01:00 to 01:59 happens twice. The rules are fixed and known, so the
 * conversion is plain arithmetic, never the runtime's time zone database.
 *
 * True time is a "night second": whole seconds since 18:00 CDT. It is monotonic, so it is
 * what the generator orders by; only the clock faces below ever reach a feed.
 */

const HOUR = 3600;

/** Seconds from 18:00 CDT to 03:00 CST: nine wall-clock hours plus the repeated one. */
export const NIGHT_SECONDS = 10 * HOUR;

/** The night second of 02:00 CDT, which is also 01:00 CST: the instant the clocks fall back. */
export const FALL_BACK_SECOND = 8 * HOUR;

export type UtcOffset = "-05:00" | "-06:00";

/** A moment as a wall clock in Hollow Creek shows it. */
export interface ClockFace {
  /** DuckDB TIMESTAMP text, `YYYY-MM-DD HH:MM:SS`, with no zone. */
  readonly local: string;
  readonly utcOffset: UtcOffset;
}

// Local time is counted in seconds since midnight starting Oct 31.
const NIGHT_START_LOCAL = 18 * HOUR;
const DAY = 24 * HOUR;
const DATES = ["2026-10-31", "2026-11-01"] as const;
const LOCAL_TEXT = /^(2026-10-31|2026-11-01) (\d{2}):(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function assertNightSecond(second: number): void {
  if (!Number.isInteger(second) || second < 0 || second > NIGHT_SECONDS) {
    throw new RangeError(`${String(second)} is not a whole second of the night.`);
  }
}

/** The wall clock and UTC offset at a night second, from 0 (18:00 CDT) to NIGHT_SECONDS (03:00 CST). */
export function clockAt(second: number): ClockFace {
  assertNightSecond(second);
  const daylight = second < FALL_BACK_SECOND;
  // After the fall-back the wall clock reads one hour behind where it would have.
  const local = NIGHT_START_LOCAL + second - (daylight ? 0 : HOUR);
  const day = DATES[local >= DAY ? 1 : 0];
  const ofDay = local % DAY;
  const h = Math.floor(ofDay / HOUR);
  const m = Math.floor((ofDay % HOUR) / 60);
  const s = ofDay % 60;
  return {
    local: `${day} ${pad(h)}:${pad(m)}:${pad(s)}`,
    utcOffset: daylight ? "-05:00" : "-06:00",
  };
}

/**
 * Every night second whose wall clock reads `local`, earliest first. Two in the repeated
 * 1am hour, one elsewhere in the night, none outside it: the offset is what tells the two
 * 1am readings apart.
 */
export function secondsAt(local: string): number[] {
  const match = LOCAL_TEXT.exec(local);
  if (!match) throw new RangeError(`"${local}" is not a local timestamp on Halloween night.`);
  const [, date, h, m, s] = match;
  const sinceStart =
    (date === DATES[1] ? DAY : 0) +
    Number(h) * HOUR +
    Number(m) * 60 +
    Number(s) -
    NIGHT_START_LOCAL;
  // Read as daylight time, then as standard time, which is an hour later in true time.
  const candidates = [sinceStart, sinceStart + HOUR];
  return candidates.filter((second) => {
    if (second < 0 || second > NIGHT_SECONDS) return false;
    return clockAt(second).local === local;
  });
}
