"use client";

import type { Application } from "pixi.js";
import { useMemo, useState } from "react";
import { Scene } from "@/components/scene/scene";
import type { SceneLoader } from "@/components/scene/types";
import type { CandleClockProps, FlameState } from "@/components/scene/scenes/candle-clock-art";
import { CandleClockFallback } from "@/components/scene/scenes/candle-clock-fallback";

const loadCandleClock: SceneLoader<Application, CandleClockProps> = () =>
  import("@/components/scene/scenes/candle-clock").then((scene) => scene.candleClockScene);

export function CandleClockDemo() {
  const [flame, setFlame] = useState<FlameState>("idle");
  const guttering = flame === "guttering";
  const sceneProps = useMemo(() => ({ flame }), [flame]);

  return (
    <div className="flex flex-col gap-4">
      <Scene
        scene={loadCandleClock}
        sceneProps={sceneProps}
        label={
          guttering ? "The last candle is guttering." : "A candle burns beside the night clock."
        }
        fallback={<CandleClockFallback />}
        className="aspect-[16/9] w-full rounded-lg bg-[#101624]"
      />
      <button
        type="button"
        aria-pressed={guttering}
        onClick={() => {
          setFlame(guttering ? "idle" : "guttering");
        }}
        className="self-start rounded-md border border-[#5E6E94] px-3 py-1.5 text-sm text-[#EDE3CF] hover:bg-[#172034] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD58F]"
      >
        Last candle (gutter)
      </button>
    </div>
  );
}
