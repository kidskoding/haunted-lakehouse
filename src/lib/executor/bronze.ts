import { quoteIdentifier } from "../canonical/sql";
import { relationName } from "./connection";
import type { RawCell, RawRow } from "./types";

export const BRONZE = "bronze";

/** The types a bronze column can take (runtime contract 4.2). */
type BronzeType = "VARCHAR" | "BOOLEAN" | "BIGINT" | "DOUBLE";

/** The kinds of non-null value a column has carried so far in the execution. */
interface ColumnSeen {
  readonly name: string;
  booleans: boolean;
  numbers: boolean;
  strings: boolean;
  unsafeNumbers: boolean;
}

interface Arrival {
  readonly batch: number;
  readonly seq: number;
  readonly row: RawRow;
}

// Keeps each INSERT a reasonable size for the engine's parser.
const ROWS_PER_INSERT = 1000;

function columnType(seen: ColumnSeen): BronzeType {
  const { booleans, numbers, strings } = seen;
  if (booleans && !numbers && !strings) return "BOOLEAN";
  if (numbers && !booleans && !strings) return seen.unsafeNumbers ? "DOUBLE" : "BIGINT";
  return "VARCHAR";
}

function stringLiteral(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** The SQL literal for a raw value held in a column of `type`, converted as 4.2 says. */
function literal(value: RawCell, type: BronzeType): string {
  if (value === null) return "NULL";
  switch (type) {
    case "VARCHAR":
      return stringLiteral(String(value));
    case "BOOLEAN":
      return value === true ? "TRUE" : "FALSE";
    case "BIGINT":
      return `CAST(${String(value)} AS BIGINT)`;
    case "DOUBLE":
      // Through text, so DuckDB parses JavaScript's shortest round-trip form to the same double.
      return `CAST(${stringLiteral(String(value))} AS DOUBLE)`;
  }
}

/**
 * One feed's raw table for one execution: every row delivered so far, the columns and types
 * they imply, and the rows retention still keeps (runtime contract 4.1 to 4.3).
 */
export class BronzeFeed {
  private readonly seen = new Map<string, ColumnSeen>();
  private retained: Arrival[] = [];
  private nextSeq = 0;

  constructor(readonly feed: string) {}

  get relation(): string {
    return relationName(BRONZE, this.feed);
  }

  /** Delivers a batch's rows, widening the columns and their types to cover them. */
  land(batch: number, rows: readonly RawRow[]): void {
    for (const row of rows) {
      for (const [name, value] of Object.entries(row)) this.observe(name, value);
      // Columns fold case, so a row is held by folded name: a later batch may spell it anew.
      const folded = Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name.toLowerCase(), value]),
      );
      this.retained.push({ batch, seq: this.nextSeq, row: folded });
      this.nextSeq++;
    }
  }

  /** Forgets every row that did not arrive in one of `batches`. */
  retain(batches: ReadonlySet<number>): void {
    this.retained = this.retained.filter((arrival) => batches.has(arrival.batch));
  }

  /** Statements that replace the bronze table with the retained rows, in their current types. */
  statements(): string[] {
    const columns = [...this.seen.values()]
      .map((seen) => ({ name: seen.name, key: seen.name.toLowerCase(), type: columnType(seen) }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const definitions = [
      ...columns.map((column) => `${quoteIdentifier(column.name)} ${column.type}`),
      `"_batch" INTEGER`,
      `"_seq" BIGINT`,
    ];
    const statements = [`CREATE OR REPLACE TABLE ${this.relation} (${definitions.join(", ")})`];
    for (let start = 0; start < this.retained.length; start += ROWS_PER_INSERT) {
      const tuples = this.retained.slice(start, start + ROWS_PER_INSERT).map((arrival) => {
        const cells = columns.map((column) =>
          literal(arrival.row[column.key] ?? null, column.type),
        );
        return `(${[...cells, String(arrival.batch), String(arrival.seq)].join(", ")})`;
      });
      statements.push(`INSERT INTO ${this.relation} VALUES ${tuples.join(", ")}`);
    }
    return statements;
  }

  private observe(name: string, value: RawCell): void {
    const key = name.toLowerCase();
    let seen = this.seen.get(key);
    if (!seen) {
      seen = { name, booleans: false, numbers: false, strings: false, unsafeNumbers: false };
      this.seen.set(key, seen);
    }
    if (typeof value === "boolean") seen.booleans = true;
    if (typeof value === "string") seen.strings = true;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new RangeError(`Feed ${this.feed} delivered ${String(value)} in column ${name}.`);
      }
      seen.numbers = true;
      if (!Number.isSafeInteger(value)) seen.unsafeNumbers = true;
    }
  }
}
