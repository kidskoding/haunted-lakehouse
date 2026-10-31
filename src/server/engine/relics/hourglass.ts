import "server-only";
import type { Checkpoint, PuzzleData } from "../puzzle";
import { RelicError } from "./errors";

/** What The Hourglass shows: how many rows one gold table should hold at one checkpoint. */
export interface RowCount {
  readonly table: string;
  readonly checkpointId: string;
  /** The checkpoint's time as the story shows it. */
  readonly label: string;
  readonly rowCount: number;
}

function checkpointById(data: PuzzleData, id: string): Checkpoint {
  const checkpoint = data.checkpoints.find((candidate) => candidate.id === id);
  if (!checkpoint) throw new RelicError("unknown-checkpoint", `Tonight has no checkpoint ${id}.`);
  return checkpoint;
}

/**
 * The first checkpoint the player hasn't passed yet. "Run the night" stops at the first
 * checkpoint that breaks, so every checkpoint before the latest failure has passed and that
 * one has not. Before any failure, nothing has passed.
 */
export function nextCheckpoint(failures: readonly string[], data: PuzzleData): Checkpoint {
  const failed = failures.at(-1);
  if (failed !== undefined) return checkpointById(data, failed);
  const [first] = data.checkpoints;
  if (!first) throw new RelicError("unknown-checkpoint", "Tonight has no checkpoints.");
  return first;
}

/**
 * The count The Hourglass reveals. Only the number of expected rows leaves this function,
 * never the rows themselves.
 */
export function expectedRowCount(
  data: PuzzleData,
  goldTables: readonly string[],
  table: string,
  checkpointId: string,
): RowCount {
  if (!goldTables.includes(table)) {
    throw new RelicError("unknown-table", `${table} isn't a gold table tonight.`);
  }
  const { label } = checkpointById(data, checkpointId);
  const rows = data.expected[checkpointId]?.[table];
  // validatePuzzleData guarantees every checkpoint expects every gold table.
  if (!rows) throw new Error(`Checkpoint ${checkpointId} has no expected ${table}.`);
  return { table, checkpointId, label, rowCount: rows.length };
}
