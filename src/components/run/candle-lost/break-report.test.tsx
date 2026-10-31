import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FailureReport } from "@/lib/executor/report";
import { candleStates, Revealed, WhereItBroke } from "./break-report";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");
const where = (failure: FailureReport) =>
  text(renderToStaticMarkup(<WhereItBroke failure={failure} />));

describe("candleStates", () => {
  it("gutters the candle just lost and leaves earlier ones out", () => {
    expect(candleStates(1, 1, 4)).toEqual(["lit", "guttering", "out", "out"]);
  });

  it("gutters two at once when a boss takes two", () => {
    expect(candleStates(1, 2, 3)).toEqual(["lit", "guttering", "guttering"]);
  });
});

describe("WhereItBroke", () => {
  it("names the checkpoint and the gold tables that differed", () => {
    expect(
      where({
        kind: "checkpoint",
        checkpoint: { id: "c2", label: "7:00pm", afterBatch: 4 },
        tables: ["gold.cursed_houses", "gold.lit_porches", "gold.totals"],
        revealedBatch: 4,
      }),
    ).toBe(
      "The night broke at the 7:00pm checkpoint, after batch 4: gold.cursed_houses, gold.lit_porches and gold.totals didn’t match.",
    );
  });

  it("names the model that failed and where in its file", () => {
    expect(
      where({
        kind: "error",
        error: {
          code: "sql",
          batch: 5,
          model: "silver.readings",
          path: "models/silver/readings.sql",
          phase: "step",
          message: "Conversion Error",
          line: 3,
        },
        revealedBatch: 5,
      }),
    ).toBe(
      "The night broke on batch 5: silver.readings failed to run (models/silver/readings.sql, line 3).",
    );
  });

  it("says the replay changed gold", () => {
    expect(where({ kind: "replay", revealedBatch: 6 })).toBe(
      "The night ran batch 6 a second time, and gold changed.",
    );
  });
});

describe("Revealed", () => {
  it("opens a hidden batch in bronze", () => {
    expect(text(renderToStaticMarkup(<Revealed batch={4} alreadyVisible={false} />))).toBe(
      "Batch 4 is open in bronze now.",
    );
  });

  it("says when the batch was already visible", () => {
    expect(text(renderToStaticMarkup(<Revealed batch={2} alreadyVisible />))).toBe(
      "Batch 2 was already in bronze. Nothing new opens up.",
    );
  });
});
