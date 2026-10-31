import "server-only";
import { mayor, wren } from "../lines";
import type { NarrativePack } from "../types";

export const porchLights: NarrativePack = {
  puzzleId: "porch-lights",
  title: "Porch Lights",
  status: "launch",
  owner: "mayor",
  bindings: {
    lit_at_last_checkpoint: "count",
    silent_sensors: "count",
  },
  intro: [
    mayor(
      "Welcome aboard, {you}. Tradition: at {checkpoints}, the Mayor's office announces how many homes are welcoming trick-or-treaters. A home is welcoming when its porch light is on *at that moment*. Not earlier. Not 'at some point'. Then. The porch sensors report to your lakehouse. Have the count ready.",
    ),
    wren(
      "Those sensors only speak up when something changes. A few run on old batteries. A sensor that's stopped talking hasn't told you the light went off.",
    ),
  ],
  cleared: [
    mayor(
      "{lit_at_last_checkpoint|plural:welcoming home,welcoming homes}. A record, probably. I'll say 'record' and see if anyone objects.",
    ),
    wren(
      "{silent_sensors} of those sensors went quiet tonight. You kept their last word. That's most of the job.",
    ),
  ],
  hook: [],
  autopsy: {
    title: "Event logs are not state",
    town: "The porch sensors never reported whether a light was on. They reported when it *changed*. By {last_checkpoint}, {silent_sensors|plural:sensor,sensors} had died on their porches; those lights did whatever they did, and the feed heard nothing. The Mayor's count was the number of houses whose most recent report, at or before each checkpoint, said `on`: {lit_at_last_checkpoint} at the last one.",
    tempting:
      "Count the houses with an `on` event. At {checkpoint} it's right, because every light has only been switched on once. It breaks the first time someone switches a light off, because that house still has its `on` row from earlier.",
    idea: "An **event log** records transitions. **State** is what you get by folding the log, in order, up to a point in time: 'what was true at {checkpoint}' means 'the latest event per key with a timestamp at or before {checkpoint}'. These are **last-known-value**, or *as-of*, semantics, and they are precise about silence: a device that stopped reporting keeps its last state, as a claim with an age, not as a fact about now.",
    production:
      "Every change stream has this shape: device telemetry, order-status events, feature-flag changes, user presence. A common failure is a dashboard that counts entities that ever entered a state ('devices that came online today') when the question was about the state now. The mirror-image failure treats silence as a change and marks every quiet device offline during a network blip. Teams prevent both with a current-state table keyed by entity and updated from the latest event, plus a separate last-seen time per key, so staleness is a column someone can see instead of a guess someone made.",
    search: [
      "event sourcing",
      "last observation carried forward",
      "as-of join",
      "heartbeat staleness",
    ],
  },
  epitaphs: ["Counted every light that ever came on.", "Assumed the quiet ones were off."],
};
