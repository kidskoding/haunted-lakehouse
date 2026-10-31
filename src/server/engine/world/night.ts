import "server-only";
import type { Row } from "../puzzle";
import { candyCatalogRows } from "./candy";
import {
  bowlReadingRows,
  bowlStockRows,
  generateCandyBowls,
  type CandyBowlFeed,
} from "./candy-bowls";
import { candyLedgerRows } from "./candy-ledger";
import { candyTradeRows, generateCandyTrades, type CandyTradeFeed } from "./candy-trades";
import { costumeVoteRows, generateCostumeVotes, type CostumeVote } from "./costume-votes";
import { doorScanRows, generateDoorScans, type DoorScan } from "./door-scans";
import { generateHayrideTaps, hayrideTapRows, type HayrideTap } from "./hayride";
import { generateHouses, type House } from "./houses";
import { generatePorchLights, porchLightRows, type PorchLightFeed } from "./porch-lights";
import {
  generatePumpkinSensors,
  pumpkinReadingRows,
  type PumpkinSensorFeed,
} from "./pumpkin-sensors";
import { generateTrickOrTreaters, type TrickOrTreater } from "./trick-or-treaters";

/** The raw feeds as the town's devices send them, keyed by bronze table name. */
export interface NightFeeds {
  readonly door_scans: readonly Row[];
  readonly hayride_taps: readonly Row[];
  readonly costume_votes: readonly Row[];
  readonly porch_lights: readonly Row[];
  readonly candy_bowls: readonly Row[];
  readonly bowl_stock: readonly Row[];
  readonly candy_catalog: readonly Row[];
  readonly candy_trades: readonly Row[];
  readonly candy_ledger: readonly Row[];
  readonly pumpkin_readings: readonly Row[];
}

/** One run's whole Halloween night: the true records behind every feed, and the feeds. */
export interface Night {
  readonly houses: readonly House[];
  readonly kids: readonly TrickOrTreater[];
  readonly doorScans: readonly DoorScan[];
  readonly hayrideTaps: readonly HayrideTap[];
  readonly costumeVotes: readonly CostumeVote[];
  readonly porchLights: PorchLightFeed;
  readonly candyBowls: CandyBowlFeed;
  readonly candyTrades: CandyTradeFeed;
  readonly pumpkinSensors: PumpkinSensorFeed;
  readonly feeds: NightFeeds;
}

/**
 * Generates the town and every feed of its night for a run, each from the records it depends
 * on. Every generator draws from its own seeded streams, so the order here only has to respect
 * those dependencies: door scans before anything that knows where kids were.
 */
export function generateNight(runSeed: string): Night {
  const houses = generateHouses(runSeed);
  const kids = generateTrickOrTreaters(runSeed, houses);
  const doorScans = generateDoorScans(runSeed, houses, kids);
  const hayrideTaps = generateHayrideTaps(runSeed, kids, doorScans);
  const costumeVotes = generateCostumeVotes(runSeed, kids, doorScans);
  const porchLights = generatePorchLights(runSeed, houses, doorScans);
  const candyBowls = generateCandyBowls(runSeed, houses, doorScans, porchLights.lights);
  const candyTrades = generateCandyTrades(runSeed, kids, candyBowls.handouts);
  const pumpkinSensors = generatePumpkinSensors(runSeed, houses);

  return {
    houses,
    kids,
    doorScans,
    hayrideTaps,
    costumeVotes,
    porchLights,
    candyBowls,
    candyTrades,
    pumpkinSensors,
    feeds: {
      door_scans: doorScanRows(doorScans),
      hayride_taps: hayrideTapRows(hayrideTaps),
      costume_votes: costumeVoteRows(costumeVotes),
      porch_lights: porchLightRows(porchLights.events),
      candy_bowls: bowlReadingRows(candyBowls.readings),
      bowl_stock: bowlStockRows(candyBowls.bowls),
      candy_catalog: candyCatalogRows(),
      candy_trades: candyTradeRows(candyTrades.trades),
      candy_ledger: candyLedgerRows(candyTrades.ledger),
      pumpkin_readings: pumpkinReadingRows(pumpkinSensors.readings),
    },
  };
}
