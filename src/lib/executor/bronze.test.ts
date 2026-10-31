import { describe, expect, it } from "vitest";
import { BronzeFeed } from "./bronze";
import { describe as describeRelation, type SqlConnection } from "./connection";
import { nativeConnection } from "./test-connection";
import type { RawRow } from "./types";

async function load(feed: BronzeFeed): Promise<SqlConnection> {
  const connection = await nativeConnection();
  await connection.run("CREATE SCHEMA bronze");
  for (const statement of feed.statements()) await connection.run(statement);
  return connection;
}

async function rowsOf(connection: SqlConnection, sql: string): Promise<unknown[][]> {
  return (await connection.query(sql)).rows.map((row) => [...row]);
}

describe("BronzeFeed", () => {
  it("orders feed columns by lowercased name, spelled as the feed spelled them, then system columns", async () => {
    const feed = new BronzeFeed("doors");
    feed.land(0, [{ zeta: "z", Alpha: 1, beta: true }]);
    const connection = await load(feed);
    expect(await describeRelation(connection, feed.relation)).toEqual([
      { name: "Alpha", type: "BIGINT" },
      { name: "beta", type: "BOOLEAN" },
      { name: "zeta", type: "VARCHAR" },
      { name: "_batch", type: "INTEGER" },
      { name: "_seq", type: "BIGINT" },
    ]);
  });

  it("types columns from every value seen, per runtime contract 4.2", async () => {
    const feed = new BronzeFeed("f");
    const rows: RawRow[] = [
      { nulls: null, ints: 1, floats: 1, bools: true, mixed: 1, text: "a" },
      { nulls: null, ints: 9007199254740991, floats: 0.5, bools: false, mixed: true, text: "b" },
    ];
    feed.land(0, rows);
    const connection = await load(feed);
    const types = (await describeRelation(connection, feed.relation)).map((c) => c.type);
    expect(types).toEqual([
      "BOOLEAN",
      "DOUBLE",
      "BIGINT",
      "VARCHAR",
      "VARCHAR",
      "VARCHAR",
      "INTEGER",
      "BIGINT",
    ]);
    expect(
      await rowsOf(connection, `SELECT ints, floats, mixed FROM ${feed.relation} ORDER BY _seq`),
    ).toEqual([
      [1n, 1, "1"],
      [9007199254740991n, 0.5, "true"],
    ]);
  });

  it("widens a column's type as data arrives and holds every retained row in the new type", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, [{ v: 7 }, { v: null }]);
    feed.land(1, [{ v: 1e21 }]);
    let connection = await load(feed);
    expect(
      await rowsOf(connection, `SELECT typeof(v), v FROM ${feed.relation} ORDER BY _seq`),
    ).toEqual([
      ["DOUBLE", 7],
      ["DOUBLE", null],
      ["DOUBLE", 1e21],
    ]);
    feed.land(2, [{ v: "seven" }]);
    connection = await load(feed);
    expect(await rowsOf(connection, `SELECT v FROM ${feed.relation} ORDER BY _seq`)).toEqual([
      ["7"],
      [null],
      ["1e+21"],
      ["seven"],
    ]);
  });

  it("keeps types wide after the rows that widened them are retired", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, [{ v: "late" }]);
    feed.land(1, [{ v: 3 }]);
    feed.retain(new Set([1]));
    const connection = await load(feed);
    expect(await rowsOf(connection, `SELECT v, _batch, _seq FROM ${feed.relation}`)).toEqual([
      ["3", 1, 1n],
    ]);
  });

  it("shows a column a row leaves out as NULL, and keeps columns once seen", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, [{ a: 1, dropped: "x" }]);
    feed.land(1, [{ a: 2 }]);
    feed.retain(new Set([1]));
    const connection = await load(feed);
    expect(await rowsOf(connection, `SELECT a, dropped FROM ${feed.relation}`)).toEqual([
      [2n, null],
    ]);
  });

  it("counts _seq over every delivered row, retained or not", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, [{ a: 1 }, { a: 2 }]);
    feed.land(3, [{ a: 3 }]);
    feed.retain(new Set([3]));
    const connection = await load(feed);
    expect(await rowsOf(connection, `SELECT _batch, _seq FROM ${feed.relation}`)).toEqual([
      [3, 2n],
    ]);
  });

  it("stores strings exactly, quotes included", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, [{ s: 'it\'s a "trap" -- or is it' }, { s: "" }]);
    const connection = await load(feed);
    expect(await rowsOf(connection, `SELECT s FROM ${feed.relation} ORDER BY _seq`)).toEqual([
      ['it\'s a "trap" -- or is it'],
      [""],
    ]);
  });

  it("builds an empty table when nothing is retained", async () => {
    const feed = new BronzeFeed("f");
    feed.land(0, []);
    const connection = await load(feed);
    expect(await rowsOf(connection, `SELECT count(*) FROM ${feed.relation}`)).toEqual([[0n]]);
  });

  it("rejects numbers that are not finite", () => {
    expect(() => {
      new BronzeFeed("f").land(0, [{ v: Number.NaN }]);
    }).toThrow(/delivered NaN/);
  });
});
