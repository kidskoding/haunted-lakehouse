import "server-only";
import { batchLandingBy, landingSeconds, type Cadence } from "../../batches/cadence";
import type { Injection } from "../../batches/injections";
import { scheduleBatches } from "../../batches/schedule";
import type { Checkpoint, GenerateContext, Puzzle, PuzzleData, Row } from "../../puzzle";
import { generateNight } from "../../world/night";
import { dropRow, generateDrops, VAN_HOURS, type Drop } from "./drops";
import { assignSpellings, type Spelling, type SpellingKind } from "./spellings";
import { decorationTally } from "./tally";

export const FEED = "decoration_drops";
export const GOLD_TABLE = "gold.decoration_tally";

// The van's handheld uploads every ten minutes, 18:10 through 19:30: nine batches.
const CADENCE: Cadence = { every: 600, from: 600, until: VAN_HOURS };

/** The first batch the player never sees before running the night (19:20 and 19:30). */
export const HIDDEN_FROM = 7;

const CHECKPOINTS: readonly Checkpoint[] = [
  { id: "first-look", afterBatch: 3, label: "18:40" },
  { id: "seven-oclock", afterBatch: 5, label: "19:00" },
  { id: "invoice", afterBatch: 8, label: "19:30" },
];

/** Every spelling kind is visible by the seven o'clock check. */
const EVERY_KIND_BY = 5;

/** The batches each possession starts at, one seeded pick each, always in this order. */
interface Possessions {
  readonly rename: number;
  readonly retype: number;
  readonly reorder: number;
}

function drawPossessions(context: GenerateContext): Possessions {
  const rng = context.rng("possessions");
  return { rename: rng.int(1, 3), retype: rng.int(3, 5), reorder: rng.int(5, 7) };
}

/** The handheld's three changes of shape, as the scheduler applies them by landing batch. */
function possessionInjections(
  possessions: Possessions,
  spellings: ReadonlyMap<string, Spelling>,
): Injection[] {
  return [
    {
      kind: "schemaDrift",
      from: { batch: possessions.rename },
      changes: [{ kind: "rename", column: "qty", to: "quantity" }],
    },
    {
      kind: "schemaDrift",
      from: { batch: possessions.retype },
      changes: [
        {
          kind: "custom",
          transform: (row) => {
            const spelling = spellings.get(String(row.drop_id));
            if (!spelling) throw new Error(`Drop ${String(row.drop_id)} has no spelling.`);
            return { ...row, quantity: spelling.text };
          },
        },
      ],
    },
    {
      kind: "schemaDrift",
      from: { batch: possessions.reorder },
      // The export moved its columns but the uploader kept the old header, so the two values
      // trade places under unchanged names.
      changes: [
        {
          kind: "custom",
          transform: (row) => ({ ...row, item: row.quantity ?? null, quantity: row.item ?? null }),
        },
      ],
    },
  ];
}

/** The first visible spelling of a kind, for Hobb's note to quote back at the player. */
function example(
  placed: readonly { drop: Drop; batch: number }[],
  spellings: ReadonlyMap<string, Spelling>,
  kind: SpellingKind,
  fallback: string,
): string {
  for (const { drop, batch } of placed) {
    if (batch >= HIDDEN_FROM) break;
    const spelling = spellings.get(drop.dropId);
    if (spelling?.kind === kind && spelling.text !== "") return spelling.text;
  }
  return fallback;
}

function generate(context: GenerateContext): PuzzleData {
  const night = generateNight(context.runSeed);
  const drops = generateDrops(night, (...labels) => context.rng(...labels));
  const possessions = drawPossessions(context);

  const landings = landingSeconds(CADENCE);
  const placed = drops.map((drop) => {
    const batch = batchLandingBy(landings, drop.second);
    if (batch === undefined) throw new Error(`Drop ${drop.dropId} lands after the last upload.`);
    return { drop, batch };
  });
  const spellings = assignSpellings(
    { placed, from: possessions.retype, everyKindBy: EVERY_KIND_BY, hiddenFrom: HIDDEN_FROM },
    (...labels) => context.rng(...labels),
  );

  const schedule = scheduleBatches(
    {
      cadence: CADENCE,
      feeds: {
        [FEED]: {
          events: drops.map((drop) => ({ at: drop.second, row: dropRow(drop) })),
          injections: possessionInjections(possessions, spellings),
        },
      },
    },
    (...labels) => context.rng("batches", ...labels),
  );

  const expected: Record<string, Record<string, Row[]>> = {};
  for (const checkpoint of CHECKPOINTS) {
    const arrived = schedule.arrivals.flatMap((arrival) => {
      const drop = drops[arrival.source];
      return arrival.batch <= checkpoint.afterBatch && drop ? [drop] : [];
    });
    expected[checkpoint.id] = { [GOLD_TABLE]: decorationTally(arrived, spellings) };
  }

  return {
    batches: schedule.batches,
    checkpoints: CHECKPOINTS,
    expected,
    narrative: {
      dropCount: drops.length,
      invoicedPieces: drops.reduce((sum, drop) => sum + drop.quantity, 0),
      exampleUnit: example(placed, spellings, "unit", "6 pcs"),
      exampleWord: example(placed, spellings, "word", "seven"),
      exampleDozen: example(placed, spellings, "dozen", "a dozen"),
      exampleVague: example(placed, spellings, "vague", "lots"),
    },
  };
}

/**
 * The Act I boss. Hobb's decorations feed renames, retypes, and reorders its columns as the
 * evening goes on, and the Mayor's tally must still count every piece it can and dispute,
 * rather than lose, the drops nobody counted.
 */
export const possessedFeed: Puzzle = {
  id: "possessed-feed",
  slot: 3,
  title: "The Possessed Feed",
  prerequisites: [],
  retention: 3,
  goldTables: [GOLD_TABLE],
  generate,
};
