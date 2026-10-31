import {
  DEFAULT_SETTINGS,
  clampVolume,
  loadSettings,
  saveSettings,
  volumeToGain,
  type SettingsStorage,
  type SoundSettings,
} from "./settings";
import { renderAmbient, renderSting, type Sting } from "./synth";

/*
 * The slice of Web Audio the manager uses. Real `AudioContext`s satisfy it structurally;
 * tests hand in a fake.
 */
export interface AudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
}
export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}
export interface AudioBufferLike {
  copyToChannel(source: Float32Array<ArrayBuffer>, channelNumber: number): void;
}
export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(): void;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** Everything the manager needs from the browser, injected so it can run under test. */
export interface SoundEnvironment {
  createContext(): AudioContextLike;
  storage(): SettingsStorage | null;
  watchVisibility(onChange: (visible: boolean) => void): {
    readonly current: boolean;
    stop(): void;
  };
  /** Calls `onGesture` on the next user gesture, the only moment audio may start. */
  watchGesture(onGesture: () => void): () => void;
  schedule(ms: number, task: () => void): () => void;
}

/**
 * - `off`: muted. The default, and no audio context exists until the player asks for sound.
 * - `locked`: unmuted, but the browser has seen no gesture yet, so nothing may play.
 * - `on`: unmuted and unlocked; the night is audible whenever the tab is visible.
 */
export type SoundStatus = "off" | "locked" | "on";

export interface SoundSnapshot extends SoundSettings {
  readonly status: SoundStatus;
}

export const INITIAL_SNAPSHOT: SoundSnapshot = { ...DEFAULT_SETTINGS, status: "off" };

/** Ambient sits well under the stings: it is the room, not the event. */
export const AMBIENT_LEVEL = 0.35;
export const STING_LEVEL = 0.8;

/** Time constants for gain moves, in seconds. A slider nudge is quick; a fade is a breath. */
export const FADE_IN_SECONDS = 0.4;
export const FADE_OUT_SECONDS = 0.25;
export const NUDGE_SECONDS = 0.04;
/** About five fade-out time constants: the gain is inaudible before the context suspends. */
export const SUSPEND_AFTER_MS = 1250;

export interface SoundManager {
  readonly snapshot: SoundSnapshot;
  subscribe(listener: () => void): () => void;
  /** Loads saved settings and starts watching the page. Returns the matching teardown. */
  start(): () => void;
  /** Unmuting must happen inside a user gesture, such as the toggle's click. */
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  /** Plays a sting if sound is audible. Returns whether it played. */
  play(sting: Sting): boolean;
}

interface Graph {
  readonly context: AudioContextLike;
  readonly master: GainNodeLike;
  readonly ambient: GainNodeLike;
  readonly stings: GainNodeLike;
  readonly buffers: Map<Sting, AudioBufferLike>;
  ambientStarted: boolean;
}

function toBuffer(context: AudioContextLike, samples: Float32Array<ArrayBuffer>): AudioBufferLike {
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

export function createSoundManager(env: SoundEnvironment): SoundManager {
  let settings: SoundSettings = DEFAULT_SETTINGS;
  let snapshot: SoundSnapshot = INITIAL_SNAPSHOT;
  let unlocked = false;
  let visible = true;
  let graph: Graph | null = null;
  let cancelSuspend: (() => void) | null = null;
  let stopGesture: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function publish() {
    const status: SoundStatus = settings.muted ? "off" : unlocked ? "on" : "locked";
    if (
      status === snapshot.status &&
      settings.muted === snapshot.muted &&
      settings.volume === snapshot.volume
    ) {
      return;
    }
    snapshot = { ...settings, status };
    for (const listener of listeners) listener();
  }

  function buildGraph(): Graph {
    const context = env.createContext();
    const master = context.createGain();
    const ambient = context.createGain();
    const stings = context.createGain();
    // Silent at birth so the first sound is a fade in, never a pop.
    master.gain.value = 0;
    ambient.gain.value = AMBIENT_LEVEL;
    stings.gain.value = STING_LEVEL;
    ambient.connect(master);
    stings.connect(master);
    master.connect(context.destination);
    return { context, master, ambient, stings, buffers: new Map(), ambientStarted: false };
  }

  function clearSuspend() {
    cancelSuspend?.();
    cancelSuspend = null;
  }

  /** Brings the audio graph in line with the settings and the page's visibility. */
  function apply(timeConstant: number) {
    if (!graph) return;
    const { context, master } = graph;
    const audible = unlocked && !settings.muted && visible;
    clearSuspend();
    if (audible) {
      if (context.state !== "running") void context.resume();
      if (!graph.ambientStarted) {
        const source = context.createBufferSource();
        source.buffer = toBuffer(context, renderAmbient(context.sampleRate));
        source.loop = true;
        source.connect(graph.ambient);
        source.start();
        graph.ambientStarted = true;
      }
      master.gain.setTargetAtTime(volumeToGain(settings.volume), context.currentTime, timeConstant);
    } else {
      master.gain.setTargetAtTime(0, context.currentTime, FADE_OUT_SECONDS);
      // A suspended context costs no CPU; wait for the fade so muting never clicks.
      cancelSuspend = env.schedule(SUSPEND_AFTER_MS, () => {
        cancelSuspend = null;
        void context.suspend();
      });
    }
  }

  /** Creates the audio context. Only ever called from inside a user gesture. */
  function unlock() {
    stopGesture?.();
    stopGesture = null;
    if (unlocked || settings.muted) return;
    unlocked = true;
    graph ??= buildGraph();
    apply(FADE_IN_SECONDS);
    publish();
  }

  function update(next: SoundSettings) {
    settings = next;
    saveSettings(env.storage(), settings);
  }

  return {
    get snapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      settings = loadSettings(env.storage());
      const visibility = env.watchVisibility((next) => {
        visible = next;
        apply(FADE_IN_SECONDS);
      });
      visible = visibility.current;
      // A player who left sound on last visit hears it again from their first click or key.
      if (!settings.muted) stopGesture = env.watchGesture(unlock);
      publish();
      return () => {
        visibility.stop();
        stopGesture?.();
        stopGesture = null;
        clearSuspend();
        if (graph) void graph.context.close();
        graph = null;
        unlocked = false;
        publish();
      };
    },
    setMuted(muted) {
      update({ ...settings, muted });
      if (!muted && !unlocked) unlock();
      else apply(muted ? FADE_OUT_SECONDS : FADE_IN_SECONDS);
      publish();
    },
    setVolume(volume) {
      update({ ...settings, volume: clampVolume(volume) });
      apply(NUDGE_SECONDS);
      publish();
    },
    play(sting) {
      if (!graph || !unlocked || settings.muted || !visible) return false;
      const { context, buffers } = graph;
      let buffer = buffers.get(sting);
      if (!buffer) {
        buffer = toBuffer(context, renderSting(sting, context.sampleRate));
        buffers.set(sting, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.stings);
      source.start();
      return true;
    },
  };
}
