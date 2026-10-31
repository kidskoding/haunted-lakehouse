import type { GoldHashes, NightEvent } from "@/lib/executor/types";
import type { NightSchedule, NightVerdict } from "@/lib/run/night-timeline";

export interface NightSpecimen {
  readonly id: string;
  readonly title: string;
  readonly schedule: NightSchedule;
  readonly events: readonly NightEvent[];
  readonly verdict: NightVerdict;
}

const gold = (digit: string): GoldHashes => ({
  "gold.lights_on": digit.repeat(64),
  "gold.silent_houses": "f".repeat(64),
});

/** An Act I hour: three batches seen before the night, five hidden, three checkpoints. */
const dusk: NightSchedule = {
  batches: ["6:05pm", "6:12pm", "6:20pm", "6:28pm", "6:36pm", "6:44pm", "6:52pm", "7:00pm"].map(
    (arrivesAt, index) => ({ index, arrivesAt, hidden: index >= 3 }),
  ),
  checkpoints: [
    { id: "porch-check", afterBatch: 2, label: "6:20pm" },
    { id: "mayor-glance", afterBatch: 5, label: "6:45pm" },
    { id: "seven-oclock", afterBatch: 7, label: "7:00pm" },
  ],
  replayBatch: null,
};

const duskCheckpoint = (id: string, afterBatch: number, label: string): NightEvent => ({
  kind: "checkpoint",
  checkpointId: id,
  label,
  afterBatch,
  hashes: gold("a"),
});

const duskNight: readonly NightEvent[] = [
  duskCheckpoint("porch-check", 2, "18:20"),
  duskCheckpoint("mayor-glance", 5, "18:45"),
  duskCheckpoint("seven-oclock", 7, "19:00"),
];

/** An Act III hour across the fall-back: the clocks reach 1:55am, then read 1:00am again. */
const witching: NightSchedule = {
  batches: [
    "12:40am",
    "12:55am",
    "1:10am",
    "1:25am",
    "1:40am",
    "1:55am",
    "1:05am",
    "1:20am",
    "1:35am",
  ].map((arrivesAt, index) => ({ index, arrivesAt, hidden: index >= 4 })),
  checkpoints: [
    { id: "first-one", afterBatch: 3, label: "1:30am" },
    { id: "second-one", afterBatch: 8, label: "1:30am, again" },
  ],
  replayBatch: 5,
};

const witchingNight = (after: string): readonly NightEvent[] => [
  {
    kind: "checkpoint",
    checkpointId: "first-one",
    label: "01:30",
    afterBatch: 3,
    hashes: gold("b"),
  },
  { kind: "replay", batch: 5, before: gold("c"), after: gold(after) },
  {
    kind: "checkpoint",
    checkpointId: "second-one",
    label: "01:30",
    afterBatch: 8,
    hashes: gold("d"),
  },
];

export const specimens: readonly NightSpecimen[] = [
  {
    id: "survived",
    title: "Survived",
    schedule: dusk,
    events: duskNight,
    verdict: { survived: true },
  },
  {
    id: "wrong-answer",
    title: "Wrong answer at checkpoint 2",
    schedule: dusk,
    events: duskNight,
    verdict: { survived: false, checkpointId: "mayor-glance", revealedBatch: 5 },
  },
  {
    id: "runtime-error",
    title: "Runtime error at a hidden batch",
    schedule: dusk,
    events: [
      duskCheckpoint("porch-check", 2, "18:20"),
      {
        kind: "error",
        error: {
          code: "duplicate_key",
          batch: 4,
          model: "silver.porch_state",
          phase: "step",
          message: "Two rows share the unique key house_id = 'H-114'.",
        },
      },
    ],
    verdict: { survived: false, checkpointId: "mayor-glance", revealedBatch: 4 },
  },
  {
    id: "replay-flinch",
    title: "Replay flinch",
    schedule: witching,
    events: witchingNight("e"),
    verdict: { survived: false, checkpointId: "second-one", revealedBatch: 5 },
  },
  {
    id: "replay-held",
    title: "Witching hour survived",
    schedule: witching,
    events: witchingNight("c"),
    verdict: { survived: true },
  },
];
