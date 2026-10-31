import { hashTable, type CanonicalCell } from "../canonical/hash";
import { canonicalSelect } from "../canonical/sql";
import { countRows, describe, type SqlCell, type SqlConnection } from "./connection";
import { StepFailure, asStepFailure } from "./failure";
import { MAX_MODEL_ROWS } from "./materialize";

function canonicalCell(cell: SqlCell): CanonicalCell {
  // The canonical projection yields DOUBLE, BOOLEAN, or VARCHAR, never a bigint.
  if (typeof cell === "bigint") throw new Error("A canonical read returned a bigint.");
  return cell;
}

/**
 * Reads one gold relation in canonical form and hashes it (runtime contract 7.1). A view's
 * rows count towards the row limit here, when they are read.
 */
export async function hashRelation(connection: SqlConnection, relation: string): Promise<string> {
  try {
    const rows = await countRows(connection, relation);
    if (rows > MAX_MODEL_ROWS) {
      throw new StepFailure(
        "row_limit",
        `This model returns ${String(rows)} rows; a model holds at most ${String(MAX_MODEL_ROWS)}.`,
      );
    }
    const columns = await describe(connection, relation);
    const result = await connection.query(canonicalSelect(relation, columns));
    return await hashTable({
      columns: result.columns,
      rows: result.rows.map((row) => row.map(canonicalCell)),
    });
  } catch (error) {
    throw asStepFailure(error);
  }
}
