import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import { flameReader, planBurns, type CandleBurn } from "./candle";
import type { House } from "./houses";
import { townRng } from "./town";
import { formatUtcTimestamp } from "./utc-timestamp";

/**
 * The night runs from 18:00 CDT on Sat 2026-10-31 to 03:00 CST on Sun 2026-11-01. Clocks fall
 * back at 02:00 CDT, so that span is ten real hours, not nine. Sensors stamp UTC, which never
 * repeats an hour, so all arithmetic here is plain seconds from 23:00 UTC.
 */
export const NIGHT_START_EPOCH = 1_793_487_600;
export const NIGHT_LENGTH = 10 * 3600;

/** A candle-flame sensor inside one porch's jack-o'-lantern. */
export interface PumpkinSensor {
  readonly sensorId: string;
  readonly houseId: string;
  /** The true flame history behind the readings, for building expected answers. */
  readonly burns: readonly CandleBurn[];
}

export interface PumpkinReading {
  readonly readingId: string;
  readonly sensorId: string;
  readonly houseId: string;
  /** Counts each sensor's readings from 1, so a later stage can spot resends and gaps. */
  readonly seq: number;
  readonly secondsIntoNight: number;
  readonly readAtUtc: string;
  readonly flameLux: number;
}

export interface PumpkinSensorFeed {
  readonly sensors: readonly PumpkinSensor[];
  readonly readings: readonly PumpkinReading[];
}

// Carving is a porch tradition, so candy-giving houses usually have a pumpkin and dark houses
// sometimes do. About a third of the town keeps the per-night feed around 10k readings.
const PUMPKIN_CHANCE_GIVING = 0.35;
const PUMPKIN_CHANCE_DARK = 0.15;

// Each sensor wakes about once a minute, drifting a few seconds either way, which is
// realistic for a battery device and still small enough at this pumpkin count.
const MIN_INTERVAL = 50;
const MAX_INTERVAL = 70;

/** A dark sensor reports a few zeros before it sleeps; it stays awake through a relight gap. */
function readingTimes(rng: Rng, burns: readonly CandleBurn[]): number[] {
  const first = burns[0];
  const last = burns.at(-1);
  if (!first || !last) return [];
  let trailingZeros = last.ending === "still-lit" ? 0 : rng.int(2, 6);
  const times: number[] = [];
  for (
    let t = first.litAt + rng.int(5, 40);
    t < NIGHT_LENGTH;
    t += rng.int(MIN_INTERVAL, MAX_INTERVAL + 1)
  ) {
    if (t >= last.outAt) {
      if (trailingZeros === 0) break;
      trailingZeros--;
    }
    times.push(t);
  }
  return times;
}

function simulateSensor(runSeed: string, houseId: string) {
  // Each pumpkin has its own stream, keyed by its house, so one pumpkin's draws never shift
  // another's.
  const rng = townRng(runSeed, `pumpkin-sensors/${houseId}`);
  const burns = planBurns(rng, NIGHT_LENGTH);
  const times = readingTimes(rng, burns);
  const readers = burns.map((burn) => ({ burn, read: flameReader(rng, burn) }));
  const readings = times.map((t) => {
    const lit = readers.find(({ burn }) => t >= burn.litAt && t < burn.outAt);
    return { secondsIntoNight: t, flameLux: lit ? lit.read(t) : 0 };
  });
  return { burns, readings };
}

/**
 * The jack-o'-lantern sensors and their true flame readings for one night, sorted by reading
 * time then sensor. No resends or late arrivals: the batch scheduler adds those.
 */
export function generatePumpkinSensors(
  runSeed: string,
  houses: readonly House[],
): PumpkinSensorFeed {
  const rng = townRng(runSeed, "pumpkin-sensors");
  const sensors: PumpkinSensor[] = [];
  const unsorted: Omit<PumpkinReading, "readingId">[] = [];
  for (const house of houses) {
    const chance = house.givesCandy ? PUMPKIN_CHANCE_GIVING : PUMPKIN_CHANCE_DARK;
    if (rng.float() >= chance) continue;
    const base = {
      sensorId: `PK-${String(sensors.length + 1).padStart(3, "0")}`,
      houseId: house.houseId,
    };
    const { burns, readings } = simulateSensor(runSeed, house.houseId);
    sensors.push({ ...base, burns });
    readings.forEach(({ secondsIntoNight, flameLux }, i) =>
      unsorted.push({
        ...base,
        seq: i + 1,
        secondsIntoNight,
        readAtUtc: formatUtcTimestamp(NIGHT_START_EPOCH + secondsIntoNight),
        flameLux,
      }),
    );
  }

  const readings = unsorted
    .sort(
      (a, b) =>
        a.secondsIntoNight - b.secondsIntoNight ||
        (a.sensorId < b.sensorId ? -1 : a.sensorId > b.sensorId ? 1 : 0),
    )
    .map((reading, i) => ({ readingId: `PR-${String(i + 1).padStart(6, "0")}`, ...reading }));
  return { sensors, readings };
}

/** The bronze feed rows: the sensor's payload only, without the true burn history. */
export function pumpkinReadingRows(readings: readonly PumpkinReading[]): Row[] {
  return readings.map((r) => ({
    reading_id: r.readingId,
    sensor_id: r.sensorId,
    house_id: r.houseId,
    seq: r.seq,
    read_at_utc: r.readAtUtc,
    flame_lux: r.flameLux,
  }));
}
