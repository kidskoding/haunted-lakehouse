import { describe, expect, it } from "vitest";
import { BronzeFeed } from "@/lib/executor/bronze";
import { nativeConnection } from "@/lib/executor/test-connection";
import { batchRanges, loadCatalog } from "./catalog";

async function lakehouse() {
  const connection = await nativeConnection();
  for (const schema of ["bronze", "silver", "gold", "__hl"]) {
    await connection.run(`CREATE SCHEMA ${schema}`);
  }
  const porch = new BronzeFeed("porch_events");
  porch.land(0, [{ house: "Maple", state: "on" }]);
  porch.land(1, [{ house: "Willow", state: "off" }]);
  porch.land(2, [
    { house: "Maple", state: "off", lux: 2.5 },
    { house: "Oak", state: "on", lux: 3 },
  ]);
  porch.retain(new Set([1, 2]));
  for (const sql of porch.statements()) await connection.run(sql);
  return connection;
}

describe("loadCatalog", () => {
  it("reads bronze columns, row counts, and the batches retention still holds", async () => {
    const connection = await lakehouse();
    const [porch] = await loadCatalog(connection);
    expect(porch).toEqual({
      layer: "bronze",
      name: "porch_events",
      id: "bronze.porch_events",
      kind: "table",
      columns: [
        { name: "house", type: "VARCHAR" },
        { name: "lux", type: "DOUBLE" },
        { name: "state", type: "VARCHAR" },
        { name: "_batch", type: "INTEGER" },
        { name: "_seq", type: "BIGINT" },
      ],
      rowCount: 3,
      batches: [1, 2],
    });
  });

  it("orders bronze, silver, then gold, skips scratch relations, and never counts views", async () => {
    const connection = await lakehouse();
    await connection.run("CREATE TABLE __hl.new_batch_porch_events AS SELECT 1 AS x");
    await connection.run("CREATE VIEW silver.lit AS SELECT house FROM bronze.porch_events");
    await connection.run("CREATE TABLE gold.zeta AS SELECT 1 AS n");
    await connection.run("CREATE TABLE gold.alpha AS SELECT 1 AS n UNION ALL SELECT 2");
    const catalog = await loadCatalog(connection);
    expect(catalog.map((relation) => [relation.id, relation.kind, relation.rowCount])).toEqual([
      ["bronze.porch_events", "table", 3],
      ["silver.lit", "view", null],
      ["gold.alpha", "table", 2],
      ["gold.zeta", "table", 1],
    ]);
    expect(catalog[1]?.batches).toEqual([]);
  });

  it("reports an unreadable view without losing the others", async () => {
    const connection = await lakehouse();
    await connection.run("CREATE TABLE silver.source AS SELECT 1 AS n");
    await connection.run("CREATE VIEW gold.orphan AS SELECT n FROM silver.source");
    await connection.run("DROP TABLE silver.source");
    const catalog = await loadCatalog(connection);
    const orphan = catalog.find((relation) => relation.id === "gold.orphan");
    expect(orphan?.columns).toEqual([]);
    expect(orphan?.problem).toMatch(/source/);
    expect(catalog[0]?.rowCount).toBe(3);
  });

  it("returns nothing for an empty database", async () => {
    expect(await loadCatalog(await nativeConnection())).toEqual([]);
  });
});

describe("batchRanges", () => {
  it("folds consecutive batches into runs", () => {
    expect(batchRanges([])).toBe("");
    expect(batchRanges([4])).toBe("4");
    expect(batchRanges([0, 1, 2, 5, 7, 8])).toBe("0–2, 5, 7–8");
  });
});
