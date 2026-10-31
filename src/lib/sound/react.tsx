"use client";

import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { browserSoundEnvironment } from "./browser-environment";
import {
  createSoundManager,
  INITIAL_SNAPSHOT,
  type SoundManager,
  type SoundSnapshot,
} from "./manager";
import type { Sting } from "./synth";

const SoundContext = createContext<SoundManager | null>(null);

/**
 * Holds the page's one sound manager. Nothing loads or plays until the player turns sound
 * on, so mounting this costs only a storage read.
 */
export function SoundProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [manager] = useState(() => createSoundManager(browserSoundEnvironment()));
  useEffect(() => manager.start(), [manager]);
  return <SoundContext value={manager}>{children}</SoundContext>;
}

export interface SoundApi extends SoundSnapshot {
  readonly setMuted: (muted: boolean) => void;
  readonly setVolume: (volume: number) => void;
  readonly play: (sting: Sting) => boolean;
}

/** The player's sound settings and the stings. Must be used inside `SoundProvider`. */
export function useSound(): SoundApi {
  const manager = use(SoundContext);
  if (manager === null) throw new Error("useSound must be used inside SoundProvider.");
  const snapshot = useSyncExternalStore(
    (onChange) => manager.subscribe(onChange),
    () => manager.snapshot,
    () => INITIAL_SNAPSHOT,
  );
  return {
    ...snapshot,
    setMuted: (muted) => {
      manager.setMuted(muted);
    },
    setVolume: (volume) => {
      manager.setVolume(volume);
    },
    play: (sting) => manager.play(sting),
  };
}
