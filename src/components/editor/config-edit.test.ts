import { describe, expect, it } from "vitest";
import { configCall, parseKeyList, readConfig, writeConfig } from "./config-edit";

describe("readConfig", () => {
  it("treats a file with no config call as a view", () => {
    expect(readConfig("select 1\n")).toEqual({ kind: "default" });
  });

  it("reads a set materialization and unique key", () => {
    const source =
      "{{ config(materialized='incremental', unique_key=['house_id', 'ts']) }}\nselect 1\n";
    const state = readConfig(source);
    expect(state).toMatchObject({
      kind: "set",
      config: { materialization: "incremental", uniqueKey: ["house_id", "ts"] },
    });
  });

  it("marks an unclosed config call so the picker refuses to rewrite", () => {
    expect(readConfig("{{ config(materialized='view')\nselect 1")).toEqual({ kind: "unclosed" });
  });
});

describe("writeConfig", () => {
  it("adds a config call at the top of a default file", () => {
    const next = writeConfig("select 1\n", {
      materialization: "table",
      uniqueKey: null,
    });
    expect(next).toBe("{{ config(materialized='table') }}\nselect 1\n");
  });

  it("replaces an existing config call and drops unique_key off non-incremental", () => {
    const source = "{{ config(materialized='incremental', unique_key='house_id') }}\nselect 1\n";
    const next = writeConfig(source, { materialization: "view", uniqueKey: ["house_id"] });
    expect(next).toBe("{{ config(materialized='view') }}\nselect 1\n");
  });

  it("returns null for an unclosed config call", () => {
    expect(
      writeConfig("{{ config(materialized='view')", {
        materialization: "table",
        uniqueKey: null,
      }),
    ).toBeNull();
  });
});

describe("configCall and parseKeyList", () => {
  it("renders a multi-key incremental config", () => {
    expect(configCall({ materialization: "incremental", uniqueKey: ["house_id", "ts"] })).toBe(
      "{{ config(materialized='incremental', unique_key=['house_id', 'ts']) }}",
    );
  });

  it("parses a typed key list", () => {
    expect(parseKeyList("house_id, ts")).toEqual(["house_id", "ts"]);
    expect(parseKeyList("")).toBeNull();
  });
});
