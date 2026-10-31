import "server-only";
import { marisol, wren } from "../lines";
import type { NarrativePack } from "../types";

export const candyCoOp: NarrativePack = {
  puzzleId: "candy-co-op",
  title: "The Candy Co-op",
  status: "draft",
  owner: "marisol",
  bindings: {
    question_time: "time",
    question_kid: "name",
    question_pieces: "count",
  },
  intro: [
    marisol(
      "Every piece collected at a door and every trade at my table goes into the Co-op ledger. Each line is what the child holds *after* the change, not what moved. The lines are numbered in the order things happened. But the table terminal sends them whenever it has signal, so they arrive in any order, sometimes several for the same child at once. The Mayor will ask what certain children held at certain times, and I must answer exactly. Before you ask: Dr. Okafor gives out a great deal of candy. That is not theft. I've been to her office.",
    ),
  ],
  cleared: [
    marisol(
      "At {question_time|clock}, {question_kid} held {question_pieces|plural:piece,pieces}. That matches the doors. It all matches. Nobody stole anything. I believed the numbers in the order they came.",
    ),
    wren("Order's the whole story, most nights."),
  ],
  hook: [
    marisol(
      "Please come to the Co-op. My ledger and the door scans disagree about who holds what, and I think a child is being robbed in slow motion.",
    ),
  ],
  autopsy: {
    title: "Change streams arrive out of order",
    town: "Each Co-op ledger line held a child's balance after a change, numbered in the order the changes happened. The table terminal sent lines whenever it had signal, so they arrived shuffled, sometimes several for one child in a single batch. Applied by line number, the ledger says {question_kid} held {question_pieces|plural:piece,pieces} at {question_time|clock}.",
    tempting:
      "Update each child's balance with whichever line arrived last. With good signal, arrival order is change order, and this is exactly right. The first time two lines for one child land in the same batch, or an older line arrives after a newer one, the table keeps a stale balance. It also forgets every earlier balance, so a question about any earlier time has no answer.",
    idea: "This is **change data capture** (CDC): a stream of row states, each carrying a sequence number from the source. Apply changes by sequence, not by arrival. Within a batch, keep the highest sequence per key; in the **merge**, overwrite only when the incoming sequence is newer. To answer questions about the past, keep history as a **slowly changing dimension, type 2**: one row per version, with the times it became and stopped being true.",
    production:
      "Database replication logs, change topics from tools like Debezium, and SaaS export APIs all deliver changes that can be reordered or batched together. A frequent failure is a 'latest load wins' merge that quietly rolls records back after a retry. Teams order by a source sequence (a log sequence number, a version, or an update counter), guard every merge with a sequence comparison, and build history tables so point-in-time questions can be answered and audited.",
    search: [
      "change data capture",
      "log sequence number",
      "SCD type 2",
      "out-of-order events",
      "point-in-time query",
    ],
  },
  epitaphs: ["Believed the ledger in the order it arrived.", "Accused the dentist."],
};
