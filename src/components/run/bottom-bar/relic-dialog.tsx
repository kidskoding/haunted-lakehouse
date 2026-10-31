"use client";

import { useId, useState } from "react";
import {
  selectedOption,
  targetPicker,
  type RelicBarHour,
  type RelicKind,
  type RelicTarget,
  type RelicView,
} from "@/lib/run/bottom-bar";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RelicGlyph } from "./relic-glyph";

const confirmLabel: Readonly<Record<RelicKind, string>> = {
  "wrens-lantern": "Hold up the lantern",
  "ravens-feather": "Read the batch",
  hourglass: "Turn the hourglass",
  "black-cat": "Skip the hour",
  "spare-candle": "Light it",
};

/** What the relics that ask no target say before they are spent. */
const consequence: Readonly<Record<"black-cat" | "spare-candle", string>> = {
  "black-cat": "This hour passes you by: no autopsy, no ledger page, and the cat is gone.",
  "spare-candle": "It joins the others, one more candle for the night.",
};

export interface RelicDialogProps {
  readonly relic: RelicView;
  readonly hour: RelicBarHour;
  readonly onCancel: () => void;
  readonly onConfirm: (target: RelicTarget | null) => void;
}

/**
 * Asks before a relic is spent. Relics that reveal something ask what to point them at, with
 * the first option chosen, and the confirm stays off while the hour offers nothing to point at;
 * the Black Cat and the Spare Candle ask only for a yes.
 */
export function RelicDialog({ relic, hour, onCancel, onConfirm }: RelicDialogProps) {
  const picker = targetPicker(relic.kind, hour);
  const legendId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const option = picker ? selectedOption(picker, chosen) : undefined;

  return (
    <Dialog
      open
      closeOnBackdrop={false}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-s bg-fog text-glow">
          <RelicGlyph kind={relic.kind} className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <DialogTitle>{relic.name}</DialogTitle>
          <p className="text-pretty text-ash type-prose-s">{relic.flavor}</p>
        </div>
      </div>
      <DialogDescription>
        {relic.kind === "black-cat" || relic.kind === "spare-candle"
          ? consequence[relic.kind]
          : relic.effect}
      </DialogDescription>

      {picker ? (
        <fieldset aria-labelledby={legendId} className="flex flex-col gap-2">
          <legend id={legendId} className="mb-2 text-parchment type-ui font-semibold">
            {picker.legend}
          </legend>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {picker.options.map((candidate) => (
              <label
                key={candidate.value}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-xs px-3 py-2",
                  "transition-colors duration-instant ease-out ui-hover:bg-fog",
                  "has-checked:bg-tint-flame",
                )}
              >
                <input
                  type="radio"
                  name={legendId}
                  value={candidate.value}
                  checked={candidate.value === option?.value}
                  onChange={() => {
                    setChosen(candidate.value);
                  }}
                  className="size-4 shrink-0 accent-flame"
                />
                <span className="text-parchment type-data">{candidate.label}</span>
                {candidate.detail ? (
                  <span className="ms-auto text-smoke type-ui-s">{candidate.detail}</span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <DialogActions>
        <Button variant="ghost" size="lg" data-autofocus onClick={onCancel}>
          Not yet
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={picker !== null && option === undefined}
          onClick={() => {
            onConfirm(option?.target ?? null);
          }}
        >
          {confirmLabel[relic.kind]}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
