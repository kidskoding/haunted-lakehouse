import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../registry";
import { fakePuzzle } from "../testing/fake-puzzle";
import { expectHidden, peekBatch } from "./feather";

const data = generatePuzzle(fakePuzzle(), "raven-pumpkin-13");

const code = (code: string) => expect.objectContaining({ code }) as Error;

describe("peekBatch", () => {
  it("returns one batch's raw rows and nothing else", () => {
    const peek = peekBatch(data, 2);
    expect(peek).toEqual(data.batches[2]);
    expect(Object.keys(peek).sort()).toEqual(["arrivesAt", "feeds", "index"]);
  });

  it.each([-1, 3, 1.5, Number.NaN])("refuses batch %s, which doesn't exist", (batch) => {
    expect(() => peekBatch(data, batch)).toThrow(code("unknown-batch"));
  });
});

describe("expectHidden", () => {
  it("accepts only batches past the visible ones", () => {
    expect(() => {
      expectHidden(data, 1, 1);
    }).not.toThrow();
    expect(() => {
      expectHidden(data, 2, 1);
    }).not.toThrow();
    expect(() => {
      expectHidden(data, 0, 1);
    }).toThrow(code("batch-not-hidden"));
    expect(() => {
      expectHidden(data, 2, 3);
    }).toThrow(code("batch-not-hidden"));
    expect(() => {
      expectHidden(data, 3, 1);
    }).toThrow(code("unknown-batch"));
  });

  it.each([-1, 4, 0.5])("rejects %s visible batches as a caller bug", (visible) => {
    expect(() => {
      expectHidden(data, 2, visible);
    }).toThrow(RangeError);
  });
});
