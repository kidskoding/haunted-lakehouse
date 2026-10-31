import "server-only";
import { hashTable, tableFromRows } from "../../lib/canonical/hash";
import type { ExpectedHashes } from "../../lib/executor/types";
import type { Puzzle, PuzzleData } from "../engine/puzzle";

/**
 * The expected gold hashes for every checkpoint, from the puzzle's generated answer. Columns
 * come from the puzzle's declaration, never from the rows, so an empty table keeps its header.
 */
export async function expectedHashes(puzzle: Puzzle, data: PuzzleData): Promise<ExpectedHashes> {
  const hashes: Record<string, Record<string, string>> = {};
  for (const [checkpointId, tables] of Object.entries(data.expected)) {
    const byTable: Record<string, string> = {};
    for (const [table, rows] of Object.entries(tables)) {
      const columns = puzzle.goldColumns[table];
      if (!columns) throw new Error(`Gold table ${table} declares no columns.`);
      byTable[table] = await hashTable(tableFromRows(columns, rows));
    }
    hashes[checkpointId] = byTable;
  }
  return hashes;
}
