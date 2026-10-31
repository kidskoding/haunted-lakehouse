import "server-only";
import { marisol, wren } from "../lines";
import type { NarrativePack } from "../types";

export const witchingHour: NarrativePack = {
  puzzleId: "witching-hour",
  title: "The Witching Hour",
  status: "draft",
  owner: "marisol",
  bindings: {
    question_kids: "name",
    kid_a: "name",
    pieces_first: "count",
    pieces_second: "count",
  },
  intro: [
    marisol(
      "The swap meet is advertised as one to two. Tonight the clocks go back at two, so one to two lasts two hours, and every time on the terminal between one and two happens twice. The terminal does note which: the little offset at the end. The Mayor asked what {question_kids} held at 1:30. I asked him which 1:30. He asked what I meant. Also, the terminal sometimes sends a batch twice when it reconnects. It must not count twice. Not tonight.",
    ),
    wren("Tonight the clock gives you an hour back. It'll want something for it."),
  ],
  cleared: [
    marisol(
      "At the first 1:30, {kid_a} held {pieces_first}. At the second, {pieces_second}. Same child, same clock, an hour apart. The batch came twice and the ledger didn't flinch.",
    ),
    wren(
      "Six years ago tonight the clocks went back too. I spent the second hour making a mistake I've paid for since.",
    ),
  ],
  hook: [
    wren(
      "Midnight's gone. One o'clock comes next, and then it comes again. Last time it did that, I wasn't careful.",
    ),
  ],
  autopsy: {
    title: "The repeated hour, and the batch that came twice",
    town: "At 2:00am the clocks fell back, so every local time from 1:00 to 1:59 happened twice. The terminal's timestamps carried their UTC offset, `-05:00` the first time and `-06:00` the second. {kid_a} held {pieces_first|plural:piece,pieces} at the first 1:30 and {pieces_second|plural:piece,pieces} at the second. Then the night replayed a batch, and a correct ledger did not change.",
    tempting:
      "Order and bucket by local time, and append each batch as it lands. Local time behaves like a timeline everywhere except the hour that repeats, where it shuffles two different hours of trades together. Appending works until the first redelivered batch, which counts every change in it twice.",
    idea: "During a **daylight saving fall-back**, a local time without its offset is ambiguous. Convert to UTC, or keep the offset, before ordering or comparing, and show local time only at the edge. **Idempotency** means applying the same input twice leaves the same result as applying it once. Merging on a unique key, here the ledger's line number, instead of appending makes a replayed batch harmless.",
    production:
      "Jobs that run twice or not at all on DST nights, hourly reports with a 25-hour day, and an hour billed twice are recurring incidents. Retries and replays are routine in any distributed system. Teams store timestamps in UTC alongside the original offset, test pipelines against transition dates, and design every load to be safe to rerun: merges on natural keys, partition overwrites, and a check that rerunning a batch changes nothing.",
    search: [
      "daylight saving time bugs",
      "UTC offset",
      "idempotent pipelines",
      "upsert",
      "replay safety",
    ],
  },
  epitaphs: ["Asked which 1:30. Too late.", "Counted the second hour twice."],
};
