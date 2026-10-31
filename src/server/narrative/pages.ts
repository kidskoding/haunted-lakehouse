import "server-only";
import type { PageId } from "./progress";

export interface LedgerPage {
  readonly numeral: string;
  /** The only part legible on a torn edge before the page is found. */
  readonly year: number;
  /** Fixed lore, the same for every player, in the hand of whoever wrote it. */
  readonly text: string;
}

export const LEDGER_PAGES: Readonly<Record<PageId, LedgerPage>> = {
  "page-1": {
    numeral: "I",
    year: 1891,
    text: "**Hallowe'en, 1891.** Lamps lit on the Creek Road: 4. Callers: 2, the Thorne girls, who sang for it. Given: three apples; molasses taffy, lots. *Kept by Eliza Wren.*",
  },
  "page-2": {
    numeral: "II",
    year: 1918,
    text: "**Hallowe'en, 1918.** No callers. The Board of Health forbade it. Bowls set out regardless: 13, on 13 porches, for those who would have come. All taken in full at midnight. *Kept by Thomas Wren.*",
  },
  "page-3": {
    numeral: "III",
    year: 1962,
    text: "**Hallowe'en, 1962.** Callers: a great many. Given: a handful each, or as the house could. *To whoever keeps this after me: do not tidy these. They are what was said.* *Kept by Margaret Wren.*",
  },
  "page-4": {
    numeral: "IV",
    year: 1987,
    text: '**Hallowe\'en, 1987.** The book entered into the county computer over eleven nights. Every line checked against the book twice. Where the book says "lots", the computer says "lots". *D. Wren, age 25.*',
  },
  "page-5": {
    numeral: "V",
    year: 2020,
    text: "**Town Charter, §13.** *The Ledger of Hallowe'en shall be kept by the Groundskeeper, and shall be kept whole, and no line of it shall be struck.* Enacted 2 April 1891. Repealed 2 November 2020 as \"obsolete language\", on the motion of the Mayor's office.",
  },
  "page-6": {
    numeral: "VI",
    year: 2020,
    text: "**Memo, 31 October 2020.** *To: Groundskeeper. Cc: the consultant. Migration runs in the free hour tonight. I want the old table gone by morning. Storage is a line item.* Signed, Office of the Mayor. Stapled behind it, a job summary: *status SUCCEEDED; rejected: all rows before 1950 (pieces: could not cast to INT).*",
  },
  "page-7": {
    numeral: "VII",
    year: 2020,
    text: "**1 November 2020, the second 1:48am.** *Ran it. Retention zero, safety off. Stopped it at 1:47 when I saw where the new table started. Too late, or not late enough. I can't delete the diary. I tried. I can't.* D.W.",
  },
};
