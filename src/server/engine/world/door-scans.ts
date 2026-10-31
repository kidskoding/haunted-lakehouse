import "server-only";
import type { Row } from "../puzzle";
import type { House } from "./houses";
import { clockAt, type UtcOffset } from "./night-clock";
import { planRoutes } from "./routes";
import { townRng } from "./town";
import type { TrickOrTreater } from "./trick-or-treaters";

/**
 * One kid's scan at one door, as it truly happened. Later stages resend, delay, and skew
 * these; this is the clean record they start from.
 */
export interface DoorScan {
  /** The scanner at the door. Every candy-giving house has exactly one. */
  readonly deviceId: string;
  /** Per device, 1, 2, 3, ... in the order the scanner read them. */
  readonly seq: number;
  readonly houseId: string;
  readonly kidId: string;
  /** True time, in seconds since 18:00 CDT. Never shipped: it is what the clock faces encode. */
  readonly nightSecond: number;
  /**
   * The scanner's wall clock. Alone it is ambiguous in the repeated 1am hour; with the
   * offset it pins one instant, as an ISO 8601 timestamp would. Devices log local time
   * plus offset rather than UTC so the feed reads like the town's own clocks.
   */
  readonly scannedAtLocal: string;
  readonly utcOffset: UtcOffset;
}

/** Scanner ids, one per candy-giving house, in house order. Dark houses have no scanner. */
export function assignDevices(runSeed: string, houses: readonly House[]): Map<string, string> {
  const rng = townRng(runSeed, "door-scans:devices");
  const taken = new Set<string>();
  const devices = new Map<string, string>();
  for (const house of houses) {
    if (!house.givesCandy) continue;
    let id: string;
    do {
      id = `SCN-${rng.int(0, 0x10000).toString(16).toUpperCase().padStart(4, "0")}`;
    } while (taken.has(id));
    taken.add(id);
    devices.set(house.houseId, id);
  }
  return devices;
}

function byText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Every scan of the night, in true-time order. Groups walk their routes together, and at
 * each door the members scan a few seconds apart, in a different order each time.
 */
export function generateDoorScans(
  runSeed: string,
  houses: readonly House[],
  kids: readonly TrickOrTreater[],
): DoorScan[] {
  const devices = assignDevices(runSeed, houses);
  const rng = townRng(runSeed, "door-scans:members");
  const reads: { deviceId: string; houseId: string; kidId: string; nightSecond: number }[] = [];

  for (const route of planRoutes(runSeed, houses, kids)) {
    for (const stop of route.stops) {
      const deviceId = devices.get(stop.houseId);
      if (!deviceId) throw new RangeError(`House ${stop.houseId} has no scanner.`);
      const order = [...route.kidIds];
      let nightSecond = stop.arrival;
      while (order.length > 0) {
        const [kidId] = order.splice(rng.int(0, order.length), 1);
        if (kidId === undefined) break;
        reads.push({ deviceId, houseId: stop.houseId, kidId, nightSecond });
        nightSecond += rng.int(2, 10);
      }
    }
  }

  reads.sort(
    (a, b) =>
      a.nightSecond - b.nightSecond || byText(a.deviceId, b.deviceId) || byText(a.kidId, b.kidId),
  );
  const counters = new Map<string, number>();
  return reads.map((read) => {
    const seq = (counters.get(read.deviceId) ?? 0) + 1;
    counters.set(read.deviceId, seq);
    const clock = clockAt(read.nightSecond);
    return { ...read, seq, scannedAtLocal: clock.local, utcOffset: clock.utcOffset };
  });
}

/** The `door_scans` feed: what scanners report, without the true time behind it. */
export function doorScanRows(scans: readonly DoorScan[]): Row[] {
  return scans.map((scan) => ({
    device_id: scan.deviceId,
    seq: scan.seq,
    house_id: scan.houseId,
    kid_id: scan.kidId,
    scanned_at_local: scan.scannedAtLocal,
    utc_offset: scan.utcOffset,
  }));
}
