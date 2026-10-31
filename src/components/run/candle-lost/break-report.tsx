import { Fragment } from "react";
import type { CandleState } from "@/components/run/top-bar";
import type { FailureReport } from "@/lib/executor/report";

/**
 * Each candle's state as a break lands: the ones still burning, the `lost` ones going out now,
 * and any that went out earlier in the run.
 */
export function candleStates(lit: number, lost: number, total: number): CandleState[] {
  return Array.from({ length: total }, (_, index): CandleState => {
    if (index < lit) return "lit";
    return index < lit + lost ? "guttering" : "out";
  });
}

function Name({ children }: { readonly children: string }) {
  return <code className="rounded-xs bg-inset px-1 text-parchment type-code">{children}</code>;
}

/** A batch named in the run's numbers, like a value in the story. */
function Batch({ word = "batch", index }: { readonly word?: string; readonly index: number }) {
  return (
    <span className="font-semibold text-glow tabular-nums lining-nums">
      {word} {index}
    </span>
  );
}

function Tables({ names }: { readonly names: readonly string[] }) {
  return names.map((name, index) => (
    // The tables arrive sorted from the executor and never reorder.
    <Fragment key={name}>
      {index === 0 ? null : index === names.length - 1 ? " and " : ", "}
      <Name>{name}</Name>
    </Fragment>
  ));
}

/**
 * Where the night broke, in one sentence: the checkpoint and the gold tables that differed,
 * the model that failed to run, or the replay that changed gold. Never why. Inline content
 * only, so it can sit in a paragraph.
 */
export function WhereItBroke({ failure }: { readonly failure: FailureReport }) {
  switch (failure.kind) {
    case "checkpoint":
      return (
        <>
          The night broke at the {failure.checkpoint.label} checkpoint, after{" "}
          <Batch index={failure.checkpoint.afterBatch} />: <Tables names={failure.tables} />{" "}
          didn&rsquo;t match.
        </>
      );
    case "replay":
      return (
        <>
          The night ran <Batch index={failure.revealedBatch} /> a second time, and gold changed.
        </>
      );
    case "error": {
      const { error } = failure;
      const place =
        error.path === null
          ? null
          : error.line === undefined
            ? error.path
            : `${error.path}, line ${String(error.line)}`;
      return (
        <>
          The night broke on <Batch index={error.batch} />: <Name>{error.model}</Name> failed to run
          {place === null ? "" : ` (${place})`}.
        </>
      );
    }
  }
}

/** What the break opened up: the batch is in bronze now, or it already was. */
export function Revealed({
  batch,
  alreadyVisible,
}: {
  readonly batch: number;
  readonly alreadyVisible: boolean;
}) {
  if (alreadyVisible) {
    return (
      <>
        <Batch word="Batch" index={batch} /> was already in bronze. Nothing new opens up.
      </>
    );
  }
  return (
    <>
      <Batch word="Batch" index={batch} /> is open in bronze now.
    </>
  );
}
