"use client";

import { SoundControl } from "@/components/sound/sound-control";
import { Button } from "@/components/ui/button";
import { useSound } from "@/lib/sound/react";
import type { Sting } from "@/lib/sound/synth";

const STING_LABELS: readonly (readonly [Sting, string])[] = [
  ["candle-out", "Candle out"],
  ["hour-cleared", "Hour cleared"],
  ["death", "Death"],
];

export function SoundDemo() {
  const { status, play } = useSound();
  const audible = status === "on";

  return (
    <div className="flex flex-col gap-10">
      <SoundControl />
      <section aria-labelledby="stings-heading" className="flex flex-col gap-3">
        <h2 id="stings-heading" className="type-heading text-parchment">
          Stings
        </h2>
        <div className="flex flex-wrap gap-2">
          {STING_LABELS.map(([sting, label]) => (
            <Button
              key={sting}
              type="button"
              variant="ghost"
              size="md"
              disabled={!audible}
              onClick={() => {
                play(sting);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="type-ui-s text-smoke">
          {audible ? "Each plays over the ambient night." : "Turn sound on to hear the stings."}
        </p>
      </section>
    </div>
  );
}
