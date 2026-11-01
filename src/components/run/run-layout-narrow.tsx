"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { CRYPT_HREF } from "@/lib/run/ending";
import { shareLink, type ShareOutcome } from "@/lib/run/share";
import { site } from "@/lib/site";
import type { RenderedLine } from "@/lib/story/types";
import { StoryScene } from "./story";

export interface RunLayoutNarrowProps {
  /** The hour that is waiting, such as "Porch Lights, 6:00pm". */
  readonly title?: string;
}

type SaveState =
  | { readonly outcome: "idle" | "busy" | Exclude<ShareOutcome, "failed"> }
  | { readonly outcome: "failed"; readonly url: string };

const WREN: readonly RenderedLine[] = [
  {
    speaker: "wren",
    thought: false,
    segments: [
      {
        kind: "text",
        style: "plain",
        text: "Nobody reads a pipeline through a keyhole. Find a desk. The candles will keep.",
      },
    ],
  },
];

function Status({ state }: { readonly state: SaveState }) {
  switch (state.outcome) {
    case "copied":
      return <>Link copied. Open it on a laptop and the night picks up here.</>;
    case "shared":
      return <>Sent. The night will be where you left it.</>;
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

/**
 * What the run screen shows on a window narrower than 1280px: the night needs every panel
 * side by side, so a phone gets the hour that is waiting, a way to carry this link to a laptop,
 * and the Crypt, which reads fine in a hand. On a landscape phone it splits into two columns so
 * the actions stay on the first screen.
 */
export function RunLayoutNarrow({ title }: RunLayoutNarrowProps) {
  const [save, setSave] = useState<SaveState>({ outcome: "idle" });

  const onSave = async () => {
    setSave({ outcome: "busy" });
    const url = window.location.href;
    const outcome = await shareLink(
      {
        title: site.name,
        text: title ? `${title} is waiting in Hollow Creek.` : "The night is waiting.",
        url,
      },
      navigator,
    );
    setSave(outcome === "failed" ? { outcome, url } : { outcome });
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-copy content-center gap-10 px-4 py-12 sm:px-8 sm:landscape:max-w-page sm:landscape:grid-cols-2 sm:landscape:items-center sm:landscape:gap-x-16 sm:landscape:py-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-balance text-parchment type-display-m">
          The night won&rsquo;t fit on this screen.
        </h1>
        <p className="text-pretty text-ash type-prose">
          {title ? (
            <>
              <span className="text-parchment">{title}</span> is waiting.{" "}
            </>
          ) : null}
          A run plays on a laptop, 1280 pixels wide or more, with the story, the pipeline, the
          editor, and its results all open at once. Take this link there and the night picks up
          where it is.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <StoryScene lines={WREN} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              loading={save.outcome === "busy"}
              onClick={() => {
                void onSave();
              }}
            >
              Save the link for later
            </Button>
            <Link href={CRYPT_HREF} className={buttonClassName("ghost", "lg")}>
              Visit the Crypt
            </Link>
          </div>
          <p role="status" className="min-h-5 text-ash type-ui">
            <Status state={save} />
          </p>
        </div>
      </div>
    </main>
  );
}
