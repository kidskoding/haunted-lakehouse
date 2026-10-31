import { describe, expect, it } from "vitest";
import { render, renderWithMap, sourceIndex } from "./render";
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
