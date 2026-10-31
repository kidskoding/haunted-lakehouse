import { describe, expect, it } from "vitest";
import { render, renderWithMap, sourceIndex, sourcePosition } from "./render";
import { parseTemplate, type Template } from "./template";

function template(source: string): Template {
  const result = parseTemplate(source, { tableDisabled: false });
  if (!result.ok) throw new Error(result.error.message);
  return result.template;
}

const CONTEXT = {
  thisRelation: "silver.porch_state",
  newBatchRelation: (feed: string) => `__hl.new_batch_${feed}`,
};

const MODEL = template(
  "{{ config(materialized='incremental', unique_key='id') }}\n" +
    "select * from {{ new_batch('porch_events') }} n\n" +
    "{% if is_incremental() %}where n.seq > (select max(seq) from {{ this }})" +
    "{% else %}where true{% endif %};",
);

describe("render", () => {
  it("renders the else branch on the first step", () => {
    expect(render({ template: MODEL }, { ...CONTEXT, isIncremental: false })).toBe(
      "\nselect * from __hl.new_batch_porch_events n\nwhere true;",
    );
  });

  it("renders the if branch once the model has state", () => {
    expect(render({ template: MODEL }, { ...CONTEXT, isIncremental: true })).toBe(
      "\nselect * from __hl.new_batch_porch_events n\n" +
        "where n.seq > (select max(seq) from silver.porch_state);",
    );
  });

  it("renders a model without tags to its text, config removed", () => {
    const view = template("-- lit\n{{ config(materialized='view') }} select 1");
    expect(render({ template: view }, { ...CONTEXT, isIncremental: false })).toBe(
      "-- lit\n select 1",
    );
  });

  it("renders an if block without an else to nothing on the first step", () => {
    const model = template(
      "{{ config(materialized='incremental') }}select 1{% if is_incremental() %} + 1{% endif %}",
    );
    expect(render({ template: model }, { ...CONTEXT, isIncremental: false })).toBe("select 1");
    expect(render({ template: model }, { ...CONTEXT, isIncremental: true })).toBe("select 1 + 1");
  });
});

describe("sourceIndex", () => {
  it("maps rendered positions in copied text and in tags back to the model file", () => {
    const source =
      "{{ config(materialized='incremental') }}select * from {{ new_batch('f') }} as n";
    const rendered = renderWithMap(template(source), { ...CONTEXT, isIncremental: false });
    expect(rendered.sql).toBe("select * from __hl.new_batch_f as n");
    expect(sourceIndex(rendered, 0)).toBe(source.indexOf("select"));
    expect(sourceIndex(rendered, rendered.sql.indexOf("__hl"))).toBe(source.indexOf("{{ new"));
    expect(sourceIndex(rendered, rendered.sql.indexOf("_f"))).toBe(source.indexOf("{{ new"));
    expect(sourceIndex(rendered, rendered.sql.indexOf(" as n"))).toBe(source.indexOf(" as n"));
    expect(sourceIndex(rendered, rendered.sql.length)).toBe(source.length);
  });
});

describe("sourcePosition", () => {
  const source =
    "{{ config(materialized='incremental', unique_key='id') }} select n.id,\n" +
    "  n.v from {{ new_batch('feed') }} n\n" +
    "{% if is_incremental() %}\n" +
    "join {{ this }} t using (id) where t.v < n.v\n" +
    "{% endif %}\n" +
    "where n.v > 0";
  const model = template(source);
  const at = (text: string) => {
    const index = source.indexOf(text);
    const before = source.slice(0, index).split("\n");
    return { line: before.length, column: (before.at(-1) ?? "").length + 1 };
  };
  const renderedAt = (sql: string, text: string) => {
    const before = sql.slice(0, sql.indexOf(text)).split("\n");
    return { line: before.length, column: (before.at(-1) ?? "").length + 1 };
  };

  it("maps past a removed config call on the same line", () => {
    const rendered = renderWithMap(model, { ...CONTEXT, isIncremental: false });
    expect(renderedAt(rendered.sql, "n.id")).toEqual({ line: 1, column: 9 });
    expect(sourcePosition(rendered, source, { line: 1, column: 9 })).toEqual(at("n.id"));
  });

  it("maps past tags whose substitutions are longer or shorter than the tag", () => {
    const rendered = renderWithMap(model, { ...CONTEXT, isIncremental: true });
    for (const text of [" n\n", "using (id)", "t.v < n.v", "n.v > 0"]) {
      expect(sourcePosition(rendered, source, renderedAt(rendered.sql, text))).toEqual(at(text));
    }
  });

  it("maps a place inside a substitution to the start of its tag", () => {
    const rendered = renderWithMap(model, { ...CONTEXT, isIncremental: true });
    const inThis = renderedAt(rendered.sql, "porch_state");
    expect(sourcePosition(rendered, source, inThis)).toEqual(at("{{ this }}"));
    const inNewBatch = renderedAt(rendered.sql, "new_batch_feed");
    expect(sourcePosition(rendered, source, inNewBatch)).toEqual(at("{{ new_batch"));
  });

  it("maps the lines after an unrendered branch", () => {
    const rendered = renderWithMap(model, { ...CONTEXT, isIncremental: false });
    expect(sourcePosition(rendered, source, renderedAt(rendered.sql, "n.v > 0"))).toEqual(
      at("n.v > 0"),
    );
  });

  it("returns null for a place the rendered SQL does not have", () => {
    const rendered = renderWithMap(model, { ...CONTEXT, isIncremental: false });
    expect(sourcePosition(rendered, source, { line: 99, column: 1 })).toBeNull();
  });
});
