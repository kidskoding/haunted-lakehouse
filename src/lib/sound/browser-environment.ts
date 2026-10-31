import type { SoundEnvironment } from "./manager";
import type { SettingsStorage } from "./settings";

const GESTURES = ["pointerdown", "keydown"] as const;

function storage(): SettingsStorage | null {
  // Reading `localStorage` itself throws where site data is blocked.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The real browser behind the sound manager. Touches nothing until a method is called. */
export function browserSoundEnvironment(): SoundEnvironment {
  return {
    createContext: () => new AudioContext(),
    storage,
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
    watchGesture(onGesture) {
      const stop = () => {
        for (const type of GESTURES) window.removeEventListener(type, listener, true);
      };
      const listener = () => {
        stop();
        onGesture();
      };
      for (const type of GESTURES) window.addEventListener(type, listener, true);
      return stop;
    },
    schedule(ms, task) {
      const handle = window.setTimeout(task, ms);
      return () => {
        window.clearTimeout(handle);
      };
    },
  };
}
