"use client";

import type { Application } from "pixi.js";
import { Scene } from "@/components/scene/scene";
import type { SceneLoader } from "@/components/scene/types";
import type { HollowCreekProps } from "@/components/scene/scenes/hollow-creek";
import { frameCss } from "@/components/scene/scenes/hollow-creek-art";
import { HollowCreekDrawing } from "@/components/scene/scenes/hollow-creek-drawing";

const loadHollowCreek: SceneLoader<Application, HollowCreekProps> = () =>
  import("@/components/scene/scenes/hollow-creek").then((scene) => scene.hollowCreekScene);

const NO_PROPS: HollowCreekProps = {};

/*
 * The SVG is placed exactly as the canvas places its drawing (bottom-anchored, covering the
 * width), so the server-rendered still and the live scene line up and nothing shifts when
 * the canvas takes over.
 */
const fallback = (
  <div className="absolute inset-0 overflow-hidden [container-type:size]">
    <HollowCreekDrawing
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        translate: "-50% 0",
        width: frameCss.width,
        height: "auto",
        aspectRatio: frameCss.aspectRatio,
      }}
    />
  </div>
);

/** The landing's backdrop: Hollow Creek at dusk, live once PixiJS arrives and still before then. */
export function HollowCreekScene() {
  return (
    <Scene
      scene={loadHollowCreek}
      sceneProps={NO_PROPS}
      fallback={fallback}
      className="h-full w-full"
    />
  );
}
