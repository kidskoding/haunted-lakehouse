"use client";

import type { Application } from "pixi.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { browserEnvironment } from "./browser-environment";
import { startScene, type SceneController } from "./controller";
import { createPixiRuntime } from "./pixi-runtime";
import type { SceneLoader, SceneState } from "./types";

export interface SceneProps<P> {
  /** Loads the scene module. Keep it stable (module scope): a new loader remounts the scene. */
  readonly scene: SceneLoader<Application, P>;
  readonly sceneProps: P;
  /**
   * Describes what the scene shows, for screen readers, when it conveys state. The canvas
   * itself is always hidden from assistive technology. Omit for purely decorative scenes.
   */
  readonly label?: string;
  /** Static SVG/CSS stand-in shown while the bundle loads and whenever WebGL is unavailable. */
  readonly fallback?: ReactNode;
  readonly className?: string;
}

/**
 * Mounts a PixiJS scene that fills its container. PixiJS and the scene load lazily on the
 * client; the ticker respects reduced motion and stops while the tab is hidden.
 */
export function Scene<P>({ scene, sceneProps, label, fallback, className }: SceneProps<P>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController<P> | null>(null);
  const propsRef = useRef(sceneProps);
  const [state, setState] = useState<SceneState>("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = startScene({
      loadScene: scene,
      createRuntime: (size, resolution) => createPixiRuntime(host, size, resolution),
      env: browserEnvironment(host),
      props: propsRef.current,
      onStateChange: setState,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    propsRef.current = sceneProps;
    controllerRef.current?.update(sceneProps);
  }, [sceneProps]);

  const showFallback = state === "loading" || state === "fallback";

  return (
    <div className={`relative ${className ?? ""}`} data-scene-state={state}>
      <div aria-hidden="true" className="absolute inset-0">
        {showFallback ? fallback : null}
      </div>
      <div ref={hostRef} aria-hidden="true" className="absolute inset-0 overflow-hidden" />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
