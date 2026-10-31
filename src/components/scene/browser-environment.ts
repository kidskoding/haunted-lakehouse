import type { SceneEnvironment } from "./controller";
import type { SceneSize } from "./types";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    // Browsers cap live WebGL contexts, so the probe hands its context straight back.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function sizeOf(host: HTMLElement): SceneSize {
  // A zero-sized surface makes renderers throw, so an unlaid-out host still gets one pixel.
  return { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
}

/** The real browser behind a scene mounted in `host`. */
export function browserEnvironment(host: HTMLElement): SceneEnvironment {
  return {
    supportsWebGL,
    devicePixelRatio: () => window.devicePixelRatio,
    watchReducedMotion(onChange) {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      const listener = (event: MediaQueryListEvent) => {
        onChange(event.matches);
      };
      query.addEventListener("change", listener);
      return {
        current: query.matches,
        stop: () => {
          query.removeEventListener("change", listener);
        },
      };
    },
    watchVisibility(onChange) {
      const listener = () => {
        onChange(document.visibilityState === "visible");
      };
      document.addEventListener("visibilitychange", listener);
      return {
        current: document.visibilityState === "visible",
        stop: () => {
          document.removeEventListener("visibilitychange", listener);
        },
      };
    },
    watchSize(onChange) {
      let last = sizeOf(host);
      const observer = new ResizeObserver(() => {
        const next = sizeOf(host);
        if (next.width === last.width && next.height === last.height) return;
        last = next;
        onChange(next);
      });
      observer.observe(host);
      return {
        current: last,
        stop: () => {
          observer.disconnect();
        },
      };
    },
  };
}
