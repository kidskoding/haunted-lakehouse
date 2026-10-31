import "server-only";
import { mayor, wren } from "../lines";
import type { NarrativePack } from "../types";

export const graveyardShift: NarrativePack = {
  puzzleId: "graveyard-shift",
  title: "The Graveyard Shift",
  status: "draft",
  owner: "mayor",
  bindings: {
    lateness_minutes: "count",
    flameouts_total: "count",
  },
  intro: [
    wren(
      "Every pumpkin on the hill has a sensor in it. The Mayor wants how many candles went out in each half hour, and he wants it final. The signal's poor up here. Readings straggle in late, some of them twice. And the lakehouse only keeps the last {retention|words:batch,batches} from these sensors. After that, they're gone.",
    ),
    mayor(
      "I'll accept a reading up to {lateness_minutes|plural:minute,minutes} after its half hour ends. After that the half hour is final. If a straggler turns up later, I don't want to hear about it, and I don't want the number to change. Final means final.",
    ),
  ],
  cleared: [
    mayor(
      "{flameouts_total|plural:candle,candles} out by {last_checkpoint}, final. I'll have it carved into something.",
    ),
    wren("There's one candle up here that never goes out. Never mind it. It's mine."),
  ],
  hook: [
    wren(
      "I'm going up to the graveyard. The pumpkins up there are on your feed too, and the Mayor wants numbers he can carve. Bring a coat.",
    ),
  ],
  autopsy: {
    title: "Late data, and when a window is final",
    town: "Pumpkin readings straggled in late and sometimes twice, and bronze kept only the last {retention|words:batch,batches}. The Mayor's rule closed each half hour {lateness_minutes|plural:minute,minutes} after it ended, and a closed half hour never changed. By {last_checkpoint}, the final count was {flameouts_total|plural:flame-out,flame-outs}.",
    tempting:
      "Recount each half hour from bronze after every batch. It's simple, and it's right while everything is still in bronze. Once a batch ages out, its readings vanish from the recount and its duplicates can no longer be recognized, so a number already called final moves. Counting every straggler, however late, moves it from the other side.",
    idea: "A **watermark** is the point in event time before which no more data will be accepted: here, the end of a half hour plus the allowed lateness. Windows behind the watermark are **finalized** and written once. Late readings inside the allowance update windows that are still open; anything later is dropped or set aside. Because raw data expires, the pipeline keeps its own state, the readings it has already counted, so it can **deduplicate across batches**.",
    production:
      "Stream processors such as Apache Flink and Spark Structured Streaming formalize this with event-time windows, watermarks, and allowed lateness, but the same problem appears in nightly batch jobs that reprocess 'the last three days'. Common failures are reports whose past numbers change every morning and double counts after a retry. Teams prevent them with an explicit lateness policy, incremental models that merge on a unique key, and state that outlives the source's retention.",
    search: ["watermark", "allowed lateness", "event-time windows", "incremental models"],
  },
  epitaphs: ["Kept recounting the dead.", "Waited for one more straggler."],
};
