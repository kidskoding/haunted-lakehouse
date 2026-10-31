import "server-only";
import { mayor, wren } from "../lines";
import type { NarrativePack } from "../types";

const TRADITION =
  "Tradition: at {checkpoints}, the Mayor's office announces how many homes are welcoming trick-or-treaters. A home is welcoming when its porch light is on *at that moment*. Not earlier. Not 'at some point'. Then. When I look, I look. I don't care what turns up after. Have the count ready.";

const mayorCleared = mayor(
  "{lit_at_last_checkpoint|plural:welcoming home,welcoming homes}. A record, probably. I'll say 'record' and see if anyone objects.",
);

export const porchLights: NarrativePack = {
  puzzleId: "porch-lights",
  title: "Porch Lights",
  status: "launch",
  owner: "mayor",
  bindings: {
    house_count: "count",
    lit_at_last_checkpoint: "count",
    ever_lit: "count",
    switched_off: "count",
    silent_sensors: "count",
    dark_but_counted: "count",
  },
  intro: [
    mayor(
      `Welcome aboard, {you}. Hollow Creek has {*house_count|plural:home,homes}, each with a porch sensor reporting to your lakehouse. ${TRADITION}`,
      `Welcome aboard, {you}. Every home in Hollow Creek has a porch sensor reporting to your lakehouse. ${TRADITION}`,
    ),
    wren(
      "Every bulb in town is off while the sun's up. Those sensors only speak up when something changes. A few run on old batteries, and they don't say goodbye. A sensor that's stopped talking hasn't told you the light went off. The lakehouse keeps their reports {retention|words:batch,batches} deep.",
    ),
  ],
  cleared: [
    mayorCleared,
    wren(
      "His count has {dark_but_counted|words:dark porch,dark porches} in it. The battery died first, then the bulb. You kept the last word. Nobody can do better from a desk.",
    ),
  ],
  clearedIfNone: {
    binding: "dark_but_counted",
    scene: [
      mayorCleared,
      wren(
        "Tonight {switched_off|words:porch,porches} lit up and went dark again before {last_checkpoint}. That fools the first draft of every dashboard I've ever seen.",
      ),
    ],
  },
  hook: [],
  tutorial: [
    {
      id: "story",
      target: "story",
      when: "tour",
      text: "Each hour starts here, with someone in town who needs something. Read it closely. It's the only brief you get.",
    },
    {
      id: "bronze",
      target: "tables",
      when: "tour",
      text: "Raw reports land in `bronze`, a batch at a time. Open `bronze.porch_lights` to see its columns.",
    },
    {
      id: "explore",
      target: "editor",
      when: "tour",
      text: "Query anything you like here. Exploring is free and changes nothing, so look around as long as you need.",
    },
    {
      id: "gold-model",
      target: "new-model",
      when: "tour",
      text: "Your pipeline is a set of models, each one a `select`. Models can read `bronze` and each other. The Mayor's dashboard reads `gold.welcoming_houses`: one row, with a `houses` column.",
    },
    {
      id: "preview",
      target: "preview",
      when: "tour",
      text: "Preview runs your pipeline over the batches you can see, so you can check what it makes. It's free, too.",
    },
    {
      id: "run-the-night",
      target: "run-the-night",
      when: "tour",
      text: "Run the night replays the whole hour through your pipeline, including batches you haven't seen. The Mayor checks his dashboard at {checkpoints}. If it's wrong at any of them, a candle goes out.",
    },
    {
      id: "candles",
      target: "candles",
      when: "tour",
      text: "Each night that breaks costs a candle. You have {candles|words:candle,candles}. When the last one goes out, so does the run.",
    },
    {
      id: "first-break",
      target: "timeline",
      when: "first-break",
      text: "The night stopped at {failed_checkpoint}, and the batch that broke it is open to you now. It shows where. Not why. That part is yours.",
    },
  ],
  autopsy: {
    title: "Event logs are not state",
    town: "The porch sensors never said whether a light was on, only when it *changed*. By {last_checkpoint} the feed held an `on` row for {ever_lit|plural:house,houses}, but {switched_off} of those porches had gone dark again. The Mayor's count was the {lit_at_last_checkpoint} whose latest report said `on`. Batteries died in {silent_sensors|words:sensor,sensors} before {last_checkpoint}, and a dead sensor's last word stands.",
    tempting:
      "Count the houses with an `on` row. The number only ever climbs, so it looks like a town lighting up for the evening. It breaks when a porch goes dark and its old `on` row stays. Taking each house's last row as it *arrived* fails more quietly: networks reorder, and a late `on` can land behind its own `off`.",
    idea: "An **event log** records transitions. **State** is the log folded, in order, up to a point in time: the latest event per key among those known by then, latest by the source's own sequence (here `seq`), never by arrival. These are **last-known-value**, or *as-of*, semantics, and they are precise about silence: a device that stopped reporting keeps its last state, as a claim with an age, not a fact about now.",
    production:
      "Every change stream has this shape: device telemetry, order statuses, feature flags, user presence. A common failure counts entities that ever entered a state when the question was about now. The mirror image marks every quiet device offline during a network blip. Teams keep a current-state table keyed by entity, overwritten only by a higher sequence number, plus a last-seen time per key, so staleness is a column someone can see instead of a guess someone made.",
    search: [
      "event sourcing",
      "last observation carried forward",
      "as-of join",
      "log compaction",
      "device shadow",
    ],
  },
  epitaphs: ["Counted every light that ever came on.", "Assumed the quiet ones were off."],
};
