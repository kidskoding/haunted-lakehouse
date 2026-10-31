import "server-only";
import { mayor, wren } from "../lines";
import type { NarrativePack } from "../types";

const mayorCleared = mayor(
  "A {ghost_costume}. Volunteers have been told. They asked what to do if they find it. I told them to be polite.",
);

export const wanderingGhost: NarrativePack = {
  puzzleId: "wandering-ghost",
  title: "The Wandering Ghost",
  status: "draft",
  owner: "mayor",
  bindings: {
    street_a: "name",
    street_b: "name",
    ghost_costume: "name",
    resent_scans: "count",
    skewed_scanners: "count",
  },
  intro: [
    mayor(
      "According to your door scanners, one child moved faster than a child can run. Possibly faster than a car. Find the child. I want a costume, so the volunteers know what to look for.",
    ),
    wren(
      "Three things about those scanners. They were set by hand at five o'clock, and nobody's hands agree. When one loses the network it sends everything again, with the same number on each scan. And half this town is dressed as a ghost. A costume isn't a child.",
    ),
  ],
  cleared: [
    mayorCleared,
    wren(
      "{resent_scans|plural:scan,scans} sent twice. {skewed_scanners|plural:scanner,scanners} wrong about the time. One child where no child could be. Some nights the town counts one more than it has.",
    ),
  ],
  clearedAfterHollow: [
    mayorCleared,
    wren("One child where no child could be. You checked who wasn't on the list as well, I hope."),
  ],
  hook: [
    mayor(
      "Separate matter. A child was scanned on {street_a} and on {street_b} within the same minute. The parents are fine. The parents would like to know which child.",
    ),
  ],
  autopsy: {
    title: "Resends, skewed clocks, and who is who",
    town: "Hollow Creek's door scanners were set by hand, so each clock ran off by its own amount, and {skewed_scanners|plural:scanner was,scanners were} wrong enough to matter. A scanner that lost the network resent its backlog with the same sequence numbers: {resent_scans|plural:scan,scans} arrived twice. Many children shared a costume. Only one kid id, a child in a {ghost_costume}, really moved faster than a child can.",
    tempting:
      "Drop identical rows, sort by timestamp, and flag any costume seen on two streets too quickly. Each step is reasonable. Resent scans differ in arrival time, so they survive the identical-row check. Skewed clocks put a child's scans in the wrong order. And matching by costume finds a dozen ghosts that are different children.",
    idea: "Three ideas combine. **Deduplication** needs a business key, here scanner and sequence number, not the whole row. **Clock skew** means a device's timestamps are only comparable with each other; its own sequence order is more trustworthy than its wall clock. **Entity resolution** decides which records describe the same real thing; use a stable identifier when one exists, never a descriptive attribute.",
    production:
      "Mobile apps retrying uploads, gateways replaying buffers, and at-least-once message queues all deliver the same event twice with different arrival metadata. Device clocks drift and get corrected in jumps. Customer records collide on common names. Teams deduplicate on an event id, store event time and ingestion time separately, estimate per-source clock offsets, and resolve entities with explicit keys and match rules they can audit.",
    search: [
      "at-least-once delivery",
      "idempotency key",
      "clock skew",
      "entity resolution",
      "event time vs processing time",
    ],
  },
  epitaphs: ["Trusted a scanner's watch.", "Arrested a costume."],
};
