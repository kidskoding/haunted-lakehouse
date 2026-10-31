/** A column as DuckDB's DESCRIBE reports it. */
export interface DescribedColumn {
  readonly name: string;
  readonly type: string;
}

const NUMERIC =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL(\(\d+,\s*\d+\))?)$/;

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Projects one column to a value both DuckDB builds hand to JavaScript identically: numbers
 * become DOUBLE (a JS number in both), booleans and text pass through, and everything else
 * becomes DuckDB's own text form. Native and WASM builds otherwise return different JS
 * shapes for DECIMAL, BIGINT, and every temporal type.
 *
 * TIMESTAMPTZ goes through its epoch so its text is UTC regardless of the session time
 * zone, without needing the ICU extension.
 */
function canonicalExpression(column: DescribedColumn): string {
  const ref = quoteIdentifier(column.name);
  const type = column.type.toUpperCase();
  if (NUMERIC.test(type)) return `CAST(${ref} AS DOUBLE)`;
  if (type === "BOOLEAN" || type === "VARCHAR") return ref;
  if (type === "TIMESTAMP WITH TIME ZONE")
    return `CAST(make_timestamp(epoch_us(${ref})) AS VARCHAR)`;
  return `CAST(${ref} AS VARCHAR)`;
}

/** The SELECT that reads a relation in canonical form, column names unchanged. */
export function canonicalSelect(relation: string, columns: readonly DescribedColumn[]): string {
  if (columns.length === 0) throw new Error(`${relation} has no columns.`);
  const projections = columns.map((c) => `${canonicalExpression(c)} AS ${quoteIdentifier(c.name)}`);
  return `SELECT ${projections.join(", ")} FROM ${relation}`;
}
