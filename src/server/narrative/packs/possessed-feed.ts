import "server-only";
import { mayor, narrator, wren } from "../lines";
import type { NarrativePack } from "../types";

const TALLY =
  "Moribund Party Supply bills by the piece. At {checkpoints} I want, per item, the pieces we've received and the drops we can't vouch for.";

export const possessedFeed: NarrativePack = {
  puzzleId: "possessed-feed",
  title: "The Possessed Feed",
  status: "launch",
  owner: "mayor",
  bindings: {
    drop_count: "count",
    invoiced_pieces: "count",
    paid_pieces: "count",
    recovered_rows: "count",
    unknown_rows: "count",
    swapped_rows: "count",
    example_unit: "name",
    example_word: "name",
    example_dozen: "name",
    example_vague: "name",
  },
  intro: [
    mayor(
      `${TALLY} One quantity in their feed reads '{*example_vague}'. I don't pay for '{*example_vague}'. Every drop stays on the books.`,
      `${TALLY} One quantity in their feed is a shrug. I don't pay for shrugs. Every drop stays on the books.`,
    ),
    narrator(
      "Hobb, their driver, sent a note: *New handhelds. The lads type amounts how they like: digits, digits with pcs or units ('{example_unit}'), spelled out ('{example_word}'), dozens ('{example_dozen}'). The office reads them all. If a lad couldn't count it, he wrote what he liked. We true those up Monday.*",
    ),
    wren(
      "The van's uplink keeps {retention|words:upload,uploads}. Don't ask a feed for a column it hasn't named yet. Take the whole row, then ask.",
    ),
  ],
  cleared: [
    mayor(
      "I read Hobb the tally down the phone. He invoiced {invoiced_pieces|number} pieces. I'm paying for {paid_pieces|number} and disputing {unknown_rows|plural:drop,drops}. He swears nobody touched the handhelds tonight. I'm choosing to believe him, out of fatigue.",
    ),
    wren("Feeds don't change their own minds. Somebody changes them."),
  ],
  hook: [
    mayor(
      "Moribund Party Supply has sent tonight's decoration deliveries, and they appear to be in a different language.",
    ),
  ],
  autopsy: {
    title: "Schema drift and rescued values",
    town: "Moribund's feed changed shape three times: `qty` became `quantity`, the quantity turned to text, then item and quantity swapped places on {swapped_rows|plural:row,rows}, under the old header. Of {drop_count} drops, {recovered_rows} failed a strict integer cast yet named an exact count. Nothing turns '{example_vague}' into a number, so {unknown_rows|plural:drop,drops} of that kind stayed on the tally as disputed.",
    tempting:
      "Follow the rename, `try_cast` to an integer, and drop or dispute the nulls. It never errors, and most quantities are digits, so the tally looks right, if a little low. It breaks at the first check after the text arrives: '{example_word}' and '{example_dozen}' were exact counts. A quantity of `glow stick` isn't garbage either: its count is in `item`.",
    idea: "**Schema drift** is a source changing shape without notice: renamed, retyped, added, or reordered columns. **Schema-on-read** lands each record as it came, then maps each known variant onto one target, by name, never by position. **Type coercion** follows a written rule: a value is recoverable when the rule yields exactly one number. Anything else becomes null, with its raw text kept in a **rescued data** column to say why.",
    production:
      "Vendor files and partner APIs drift. Loaders offer a choice: fail, add the new columns, or keep the target fixed and rescue stray values into a side column (Databricks Auto Loader's schema evolution modes, for one). The costly failure is a strict load that quietly filters what it can't parse: totals shrink and nothing alerts. Teams set data contracts at the boundary, alert on new or missing columns, quarantine instead of drop, and reconcile row counts from raw to clean.",
    search: [
      "schema evolution",
      "schema-on-read",
      "rescued data column",
      "dead letter queue",
      "data contracts",
    ],
  },
  epitaphs: ["Couldn't read it, so threw it away.", "Called 'a dozen' a typo."],
};
