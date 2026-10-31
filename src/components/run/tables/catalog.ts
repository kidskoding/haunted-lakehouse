import type { DescribedColumn } from "@/lib/canonical/sql";
import { countRows, describe, relationName, type SqlConnection } from "@/lib/executor/connection";

/** The schemas a player can read, in the order the pipeline flows. */
export const LAYERS = ["bronze", "silver", "gold"] as const;
export type Layer = (typeof LAYERS)[number];

/** One relation the player can query, as the table browser shows it. */
export interface CatalogRelation {
  readonly layer: Layer;
  readonly name: string;
  /** `layer.name`, the way the player writes it in SQL. */
  readonly id: string;
  readonly kind: "table" | "view";
  readonly columns: readonly DescribedColumn[];
  /** Rows held now; `null` for a view, which is never run just to count it. */
  readonly rowCount: number | null;
  /** The distinct `_batch` values a bronze feed still holds, ascending; empty elsewhere. */
  readonly batches: readonly number[];
  /** Why the relation could not be read, such as a view whose source is gone. */
  readonly problem?: string;
}

function isLayer(value: unknown): value is Layer {
  return LAYERS.some((layer) => layer === value);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function heldBatches(connection: SqlConnection, relation: string): Promise<number[]> {
  const { rows } = await connection.query(`SELECT DISTINCT "_batch" FROM ${relation} ORDER BY 1`);
  return rows.flatMap(([batch]) =>
    typeof batch === "number" || typeof batch === "bigint" ? [Number(batch)] : [],
  );
}

async function readRelation(
  connection: SqlConnection,
  layer: Layer,
  name: string,
  kind: "table" | "view",
): Promise<CatalogRelation> {
  const relation = relationName(layer, name);
  const base = { layer, name, id: `${layer}.${name}`, kind };
  try {
    const columns = await describe(connection, relation);
    const rowCount = kind === "table" ? await countRows(connection, relation) : null;
    const batches =
      layer === "bronze" && columns.some((column) => column.name === "_batch")
        ? await heldBatches(connection, relation)
        : [];
    return { ...base, columns, rowCount, batches };
  } catch (error) {
    // One unreadable relation must not hide the rest of the lakehouse.
    const problem = error instanceof Error ? error.message : String(error);
    return { ...base, columns: [], rowCount: null, batches: [], problem };
  }
}

/**
 * Every bronze, silver, and gold relation in the database, with its columns, row count, and
 * (for bronze) the batches it still holds. The runtime's `__hl` scratch schema is left out.
 * Relations come bronze first, then silver, then gold, each sorted by name.
 */
export async function loadCatalog(connection: SqlConnection): Promise<CatalogRelation[]> {
  const { rows } = await connection.query(
    `SELECT table_schema, table_name, table_type FROM information_schema.tables
     WHERE table_schema IN (${LAYERS.map((layer) => `'${layer}'`).join(", ")})`,
  );
  const listed = rows
    .flatMap(([schema, name, type]) =>
      isLayer(schema) && typeof name === "string"
        ? [{ layer: schema, name, kind: type === "VIEW" ? ("view" as const) : ("table" as const) }]
        : [],
    )
    .sort(
      (a, b) => LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || byCodeUnit(a.name, b.name),
    );
  const relations: CatalogRelation[] = [];
  // One at a time: the engine runs requests serially anyway, and the order stays obvious.
  for (const { layer, name, kind } of listed) {
    relations.push(await readRelation(connection, layer, name, kind));
  }
  return relations;
}

/** Batch indices as short runs for display: `[0, 1, 2, 5]` reads "0–2, 5". */
export function batchRanges(batches: readonly number[]): string {
  const runs: string[] = [];
  let index = 0;
  while (index < batches.length) {
    const start = batches[index] ?? 0;
    let end = start;
    while (batches[index + 1] === end + 1) {
      end += 1;
      index += 1;
    }
    runs.push(end === start ? String(start) : `${String(start)}–${String(end)}`);
    index += 1;
  }
  return runs.join(", ");
}
