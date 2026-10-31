import "server-only";
import { hashTable, tableFromRows } from "../../lib/canonical/hash";
import type { ExpectedHashes } from "../../lib/executor/types";
import type { PuzzleData, Row } from "../engine/puzzle";

/** Stable column order for a gold table's expected rows (canonical hash sorts them again). */
function columnsOf(rows: readonly Row[]): readonly string[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The expected gold hashes for every checkpoint, from the puzzle's generated answer. */
export async function expectedHashes(data: PuzzleData): Promise<ExpectedHashes> {
  const hashes: Record<string, Record<string, string>> = {};
  for (const [checkpointId, tables] of Object.entries(data.expected)) {
    const byTable: Record<string, string> = {};
    for (const [table, rows] of Object.entries(tables)) {
      byTable[table] = await hashTable(tableFromRows(columnsOf(rows), rows));
    }
    hashes[checkpointId] = byTable;
  }
  return hashes;
}
