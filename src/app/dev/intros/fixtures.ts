import "server-only";
import type { BossIntroView, CurseIntroView } from "@/components/run/hour-intro";
import type { TopBarView } from "@/components/run/top-bar";
import { curseAddsRelic } from "@/server/engine/run/relics";
import type { CharacterId, CurseId, RunState } from "@/server/engine/run/types";
import { failureCost, slotDefinition, type Act, type Slot } from "@/server/engine/slots";
import { CURSE_FLAVOR } from "@/server/narrative/flavor";
import { narrativePack } from "@/server/narrative/packs";
import { NIGHT } from "../top-bar/fixtures";

export interface IntroFixture {
  readonly id: string;
  readonly caption: string;
  readonly boss: BossIntroView | null;
  readonly curse: CurseIntroView | null;
  /** The run screen's top bar behind the intro. */
  readonly topBar: TopBarView;
}

interface Hour {
  readonly slot: Slot;
  readonly puzzleId: string;
  readonly curse: CurseId | null;
  readonly character?: CharacterId;
  readonly unlockedActs?: Act;
}

/** A run waiting in `hour`, just opened, with nothing yet in hand or in its history. */
function openHour({ slot, puzzleId, curse, character = "intern", unlockedActs = 3 }: Hour) {
  const state: RunState = {
    seed: "raven-pumpkin-13",
    character,
    unlockedActs,
    status: "playing",
    phase: "in-hour",
    candles: 3,
    tableMaterialization: true,
    slot,
    hour: { slot, puzzleId, curse, failures: [], revealed: [], openAttempt: null },
    history: [],
    relics: [],
    offer: null,
    actReached: slotDefinition(slot).act,
    lastEnding: null,
  };
  return state;
}

/** The intro the server would hand the run screen for `hour`, as the engine sees it. */
function fixture(id: string, caption: string, hour: Hour): IntroFixture {
  const state = openHour(hour);
  const { time, tier, act, boss } = slotDefinition(hour.slot);
  return {
    id,
    caption,
    boss: boss
      ? {
          title: narrativePack(hour.puzzleId).title,
          time,
          tier,
          act,
          candleCost: failureCost(hour.slot),
        }
      : null,
    curse: hour.curse ? { ...CURSE_FLAVOR[hour.curse], bonusRelic: curseAddsRelic(state) } : null,
    topBar: {
      candles: { lit: 3, total: 4 },
      slot: hour.slot,
      slots: NIGHT,
      seed: state.seed,
      curse: hour.curse ? CURSE_FLAVOR[hour.curse].name : null,
    },
  };
}

/** Each curse, each act's boss (Acts II and III from their titles only), and a cursed boss. */
export function introFixtures(): IntroFixture[] {
  return [
    fixture("possession", "Curse of Possession", {
      slot: 2,
      puzzleId: "thirteenth-door",
      curse: "possession",
    }),
    fixture("fog", "Curse of the Fog", { slot: 2, puzzleId: "thirteenth-door", curse: "fog" }),
    fixture("short-memory", "Curse of Short Memory, the Night Clerk", {
      slot: 5,
      puzzleId: "wandering-ghost",
      curse: "short-memory",
      character: "night_clerk",
    }),
    fixture("darkness", "Curse of Darkness, Old Wren: no relic to win", {
      slot: 2,
      puzzleId: "thirteenth-door",
      curse: "darkness",
      character: "old_wren",
    }),
    fixture("boss-1", "Act I boss", { slot: 3, puzzleId: "possessed-feed", curse: null }),
    fixture("boss-1-fog", "Act I boss under the Fog", {
      slot: 3,
      puzzleId: "possessed-feed",
      curse: "fog",
      unlockedActs: 2,
    }),
    fixture("boss-2", "Act II boss", { slot: 7, puzzleId: "graveyard-shift", curse: null }),
    fixture("boss-3", "Act III boss", { slot: 10, puzzleId: "seance", curse: null }),
  ];
}
