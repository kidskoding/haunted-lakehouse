import "server-only";
import { mayor, wren } from "../lines";
import type { NarrativePack } from "../types";

export const possessedFeed: NarrativePack = {
  puzzleId: "possessed-feed",
  title: "The Possessed Feed",
  status: "launch",
  owner: "mayor",
  bindings: {
    recovered_rows: "count",
    unknown_rows: "count",
  },
  intro: [
    mayor(
      "The Moribund contract pays per item delivered. Their feed was fine at six. Now the columns have new names, some numbers are words, and one quantity is listed as 'lots'. I don't pay for 'lots'. I also don't pretend it didn't come: there's a forty-foot inflatable bat on the Town Green. Every delivery stays on the books. If you can tell how many, tell me. If you truly can't, say so.",
    ),
    wren(
      "Things written in a hurry still mean something. Read them the way they were meant, and don't invent what they didn't say.",
    ),
  ],
  cleared: [
    mayor(
      "{recovered_rows|plural:delivery,deliveries} recovered, {unknown_rows} genuinely unknown, and the bat is accounted for. Moribund says they changed nothing. I'm choosing to believe them, out of fatigue.",
    ),
    wren("You kept the rows you couldn't read. Not everyone does."),
  ],
  hook: [
    mayor(
      "Moribund Party Supply has sent tonight's decoration deliveries, and they appear to be in a different language.",
    ),
  ],
  autopsy: {
    title: "Schema drift and rescued values",
    town: "Partway through the night, Moribund's feed renamed its columns and started writing some quantities as words. Most of the strange values still meant a number. Mapped back to the old shape, {recovered_rows|plural:delivery,deliveries} could be read exactly. {unknown_rows|plural:delivery,deliveries} said something like 'lots', which no rule turns into a count, so they stayed on the books as unknown.",
    tempting:
      "Cast strictly and filter out whatever fails. It protects a typed table, and it's what many loaders do by default. It breaks when the contract pays per delivery: every dropped row is a delivery that happened and now doesn't exist. Turning every failure into a null is gentler, and still throws away the deliveries that could have been read.",
    idea: "**Schema drift** is a source changing shape without notice: columns renamed, added, or retyped. A robust load maps each known variant onto one target schema, parses with a cast that returns null instead of failing (`try_cast` in many engines), and keeps the raw text of anything that didn't parse in a **rescued data** column beside the typed value. Null then means 'unknown', and the raw text says why.",
    production:
      "Vendor files, partner APIs, and event payloads all drift: a column renamed in a release, a number that arrives as a string, a field nobody announced. A frequent failure is a strict pipeline that quietly filters the rows it can't parse, so totals shrink and nothing alerts. Teams prevent it with data contracts at the boundary, alerts on new or missing columns, a rescued-data column or quarantine table instead of a filter, and row counts reconciled between the raw and clean layers.",
    search: [
      "schema evolution",
      "try_cast",
      "rescued data column",
      "dead letter queue",
      "data contracts",
    ],
  },
  epitaphs: ["Couldn't read it, so threw it away.", "Paid for 'lots'."],
};
