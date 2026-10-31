import "server-only";
import { wren } from "../lines";
import type { NarrativePack } from "../types";

/*
 * Draft autopsy. Its protocol claims (log replay from the latest checkpoint, add and remove
 * actions, tombstones, VACUUM's retention threshold) must be checked against the sections of
 * the Delta Lake PROTOCOL.md that the Séance's design doc cites before this pack launches.
 */
export const seance: NarrativePack = {
  puzzleId: "seance",
  title: "The Séance",
  status: "draft",
  owner: "wren",
  bindings: {
    restored_version: "count",
    restored_rows: "count",
    restored_last_year: "count",
    lost_versions: "count",
  },
  intro: [
    wren(
      "Before the town modernized, it kept a ledger. Every Halloween since 1891. In 2020 it was dropped, and the files under it were cleared away. Not all of them. What's left is its diary, every change it ever made, written in order, and some scattered pages.",
    ),
    wren(
      "Read the diary carefully. A page the diary says was torn out is gone, even if you find it lying on the floor. A page the diary still needs, and that isn't anywhere, means that day can't be read whole. Bring it back as it truly was, on the last day it can be read whole. Not a day later. Not a page more.",
    ),
  ],
  oldWrenIntro: [
    wren("I've read this diary in my head every night for six years. Time to read it properly."),
  ],
  // Clearing the Séance always plays an ending.
  cleared: [],
  hook: [
    wren(
      "Come up to the graveyard, {you}. Bring your laptop. There's something I've been meaning to read for six years, and I'd rather not do it alone.",
    ),
  ],
  autopsy: {
    title: "Reading a table from its transaction log",
    town: "The old ledger was a Delta table. Its `_delta_log` survived: an ordered run of commits, each adding and removing data files. Most of the files did not. Version {restored_version} was the newest whose every live file still existed: {restored_rows|plural:line,lines}, from 1891 to {restored_last_year}. The {lost_versions|plural:version,versions} after it each needed a file that was gone.",
    tempting:
      "Read the latest version, or read every Parquet file in the folder. The first fails because the newest commits point at files that were moved away. The second brings back rows the log had already removed: a file can stay on disk after its `remove` action until a vacuum deletes it, and that does not make it part of the table.",
    idea: "A Delta table's state at a version comes from **log replay**: start from the latest checkpoint at or before that version, if there is one, then apply each commit's `add` and `remove` actions in order. The live files are those added and not since removed. A `remove` leaves a **tombstone**, and **VACUUM** later deletes files the table no longer references once they are older than its retention threshold. Reading an old version works only while every file it needs remains.",
    production:
      "Delta Lake, Apache Iceberg, and Apache Hudi all keep table metadata apart from the data files. Common failures are vacuuming with a short retention and breaking time travel or long-running readers, reading a table's directory instead of its log, and copy-then-delete migrations that leave a log pointing at missing files. Teams keep retention longer than any reader or rollback window, compare row counts before dropping anything, and restore through the log rather than a directory listing.",
    search: [
      "Delta Lake transaction log",
      "time travel",
      "VACUUM retention",
      "tombstones",
      "open table formats",
    ],
  },
  epitaphs: ["Read every page on the floor.", "Trusted the last thing the diary said."],
};
