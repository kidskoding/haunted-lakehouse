"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { cx } from "@/components/ui/cx";
import { shareLink, type ShareOutcome } from "@/lib/run/share";
import { RISE_AGAIN_HREF, replaySeedHref, type TombstoneView } from "@/lib/run/tombstone";
import { site } from "@/lib/site";

export interface DeathActionsProps {
  readonly stone: TombstoneView;
  /** The stone's share page, from the server's `tombstonePaths`; resolved against this origin. */
  readonly sharePath: string;
  readonly className?: string;
}

type ShareState =
  | { readonly outcome: "idle" | "busy" | Exclude<ShareOutcome, "failed"> }
  | { readonly outcome: "failed"; readonly url: string };

function Status({ state }: { readonly state: ShareState }) {
  switch (state.outcome) {
    case "copied":
      return <>Link copied. Its preview shows the stone.</>;
    case "shared":
      return <>Sent.</>;
    case "failed":
      return (
        <>
          The clipboard wouldn&rsquo;t take it. Copy the link from here:{" "}
          <span className="break-all text-parchment select-all">{state.url}</span>
        </>
      );
    default:
      return null;
  }
}

/** Rise again, Share, and Replay seed: the only ways out of a death. */
export function DeathActions({ stone, sharePath, className }: DeathActionsProps) {
  const [share, setShare] = useState<ShareState>({ outcome: "idle" });

  const onShare = async () => {
    setShare({ outcome: "busy" });
    const url = new URL(sharePath, window.location.href).href;
    const outcome = await shareLink(
      { title: site.name, text: `${stone.handle}, ${stone.characterTitle}: ${stone.epitaph}`, url },
      navigator,
    );
    setShare(outcome === "failed" ? { outcome, url } : { outcome });
  };

  return (
    <div className={cx("flex flex-col items-center gap-4", className)}>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={RISE_AGAIN_HREF} className={buttonClassName("primary", "lg")}>
          Rise again
        </Link>
        <Link href={replaySeedHref(stone.seed)} className={buttonClassName("ghost", "lg")}>
          Replay seed
        </Link>
        <Button
          variant="ghost"
          size="lg"
          loading={share.outcome === "busy"}
          onClick={() => {
            void onShare();
          }}
        >
          Share
        </Button>
      </div>
      <p role="status" className="min-h-5 max-w-copy text-center text-ash type-ui">
        <Status state={share} />
      </p>
    </div>
  );
}
