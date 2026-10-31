"use client";

import { useState } from "react";
import {
  relicBlockedReason,
  type RelicBarHour,
  type RelicKind,
  type RelicTarget,
  type RelicView,
} from "@/lib/run/bottom-bar";
import { IconButton } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Tooltip } from "@/components/ui/tooltip";
import { RelicDialog } from "./relic-dialog";
import { RelicGlyph } from "./relic-glyph";

export interface RelicBarProps {
  readonly relics: readonly RelicView[];
  readonly hour: RelicBarHour;
  /** The player confirmed a relic; `target` is `null` for the relics that take none. */
  readonly onUse: (relic: RelicKind, target: RelicTarget | null) => void;
  readonly className?: string;
}

function RelicCard({ relic, reason }: { relic: RelicView; reason: string | null }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-semibold">{relic.name}</span>
      <span>{relic.effect}</span>
      <span className="text-ash">{relic.flavor}</span>
      {reason ? <span className="text-tallow">{reason}</span> : null}
    </span>
  );
}

/**
 * The relics in hand, as quiet glyph buttons. Each one's tooltip holds its name, what it does,
 * its flavor, and, when it can't act, why; activating one opens the dialog that asks for its
 * target or a yes.
 */
export function RelicBar({ relics, hour, onUse, className }: RelicBarProps) {
  const [pending, setPending] = useState<RelicView | null>(null);

  return (
    <div role="group" aria-label="Relics" className={cx("flex items-center gap-1", className)}>
      {relics.length === 0 ? (
        <p className="px-2 text-smoke type-ui">No relics in hand.</p>
      ) : (
        relics.map((relic) => {
          const reason = relicBlockedReason(relic, hour);
          return (
            <Tooltip
              key={relic.kind}
              side="top-start"
              content={<RelicCard relic={relic} reason={reason} />}
            >
              <IconButton
                size="lg"
                label={relic.name}
                icon={<RelicGlyph kind={relic.kind} className="size-6" />}
                disabled={reason !== null}
                aria-haspopup="dialog"
                onClick={() => {
                  setPending(relic);
                }}
              />
            </Tooltip>
          );
        })
      )}
      {hour.darkness && relics.length > 0 ? (
        <p className="px-2 text-smoke type-ui">Darkness: no charm will light this hour.</p>
      ) : null}
      {pending ? (
        <RelicDialog
          relic={pending}
          hour={hour}
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={(target) => {
            setPending(null);
            // The hour may have moved on while the dialog was open.
            const current = relics.find((held) => held.kind === pending.kind);
            if (current && relicBlockedReason(current, hour) === null) onUse(pending.kind, target);
          }}
        />
      ) : null}
    </div>
  );
}
