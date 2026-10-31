"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cubicBezier } from "../scene/motion";
import { durations, easings } from "../../lib/design/tokens";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  // The in-game Motion setting lives on <html data-motion>, as tokens.css reads it.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-motion"] });
  return () => {
    query.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function reducedNow(): boolean {
  const setting = document.documentElement.dataset.motion;
  if (setting === "reduce") return true;
  if (setting === "full") return false;
  return window.matchMedia(QUERY).matches;
}

/** True when motion should be calm: the OS preference, unless the Motion setting overrides it. */
export function useReducedMotion(): boolean {
  // The server renders the calm version; the client corrects it on hydration.
  return useSyncExternalStore(subscribe, reducedNow, () => true);
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const easeOut = cubicBezier(...easings.out);

/**
 * Glides each point from where it is drawn now to its new target over the `slow` duration.
 * New points start at their target; under reduced motion every point jumps.
 */
export function useGlide(
  targets: ReadonlyMap<string, Point>,
  reduced: boolean,
): ReadonlyMap<string, Point> {
  const [shown, setShown] = useState(targets);
  const shownRef = useRef(targets);

  useEffect(() => {
    const from = shownRef.current;
    const moving = [...targets].some(([id, to]) => {
      const at = from.get(id);
      return at !== undefined && (at.x !== to.x || at.y !== to.y);
    });
    const duration = reduced || !moving ? 0 : durations.slow;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const k = easeOut(progress);
      const next = new Map(
        [...targets].map(([id, to]) => {
          const at = from.get(id) ?? to;
          return [id, { x: at.x + (to.x - at.x) * k, y: at.y + (to.y - at.y) * k }];
        }),
      );
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [targets, reduced]);

  if (reduced) return targets;
  // Points that appeared since the last frame sit at their target from the start.
  return new Map([...targets].map(([id, to]) => [id, shown.get(id) ?? to]));
}
