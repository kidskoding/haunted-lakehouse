import type { TopBarSlot, TopBarView } from "@/components/run/top-bar";

/** The slot table as the top bar sees it; a test keeps it in step with the engine's. */
export const NIGHT: readonly TopBarSlot[] = [
  { slot: 1, time: "18:00", act: 1, boss: false, repeat: false },
  { slot: 2, time: "18:45", act: 1, boss: false, repeat: false },
  { slot: 3, time: "19:30", act: 1, boss: true, repeat: false },
  { slot: 4, time: "20:15", act: 2, boss: false, repeat: false },
  { slot: 5, time: "21:00", act: 2, boss: false, repeat: false },
  { slot: 6, time: "21:45", act: 2, boss: false, repeat: false },
  { slot: 7, time: "22:30", act: 2, boss: true, repeat: false },
  { slot: 8, time: "23:15", act: 3, boss: false, repeat: false },
  // The clocks fell back at 2am daylight time: this hour opens on the second 1:00am.
  { slot: 9, time: "01:00", act: 3, boss: false, repeat: true },
  { slot: 10, time: "02:00", act: 3, boss: true, repeat: false },
];

export interface Specimen {
  readonly id: string;
  readonly title: string;
  readonly view: TopBarView;
}

function at(slot: number, lit: number, total: number, seed: string, curse: string | null = null) {
  return { candles: { lit, total }, slot, slots: NIGHT, seed, curse };
}

export const specimens: readonly Specimen[] = [
  { id: "dusk", title: "The Intern's first hour", view: at(1, 4, 4, "raven-pumpkin-13") },
  {
    id: "boss",
    title: "Act I boss, one candle lost",
    view: at(3, 3, 4, "raven-pumpkin-13"),
  },
  {
    id: "cursed",
    title: "Act II, cursed",
    view: at(5, 2, 3, "lantern-moth-42", "Curse of the Fog"),
  },
  {
    id: "witching",
    title: "The second 1:00am",
    view: at(9, 1, 3, "hollow-gate-07", "Curse of Short Memory"),
  },
  { id: "seance", title: "Old Wren at the Séance", view: at(10, 1, 1, "kept-it-this-time") },
  { id: "dark", title: "The last candle out", view: at(8, 0, 3, "cellar-door-99") },
];
