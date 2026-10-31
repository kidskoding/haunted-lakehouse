import { describe, expect, it } from "vitest";
import {
  AMBIENT_LEVEL,
  FADE_OUT_SECONDS,
  STING_LEVEL,
  SUSPEND_AFTER_MS,
  createSoundManager,
  type AudioBufferLike,
  type AudioContextLike,
  type AudioNodeLike,
  type BufferSourceLike,
  type GainNodeLike,
  type SoundEnvironment,
} from "./manager";
import { SETTINGS_KEY, type SettingsStorage } from "./settings";

class FakeNode implements AudioNodeLike {
  readonly outputs: AudioNodeLike[] = [];
  connect(destination: AudioNodeLike) {
    this.outputs.push(destination);
  }
}

class FakeGain extends FakeNode implements GainNodeLike {
  readonly targets: { target: number; timeConstant: number }[] = [];
  readonly gain = {
    value: 1,
    setTargetAtTime: (target: number, _start: number, timeConstant: number) => {
      this.targets.push({ target, timeConstant });
    },
  };
  /** Where the gain is heading: the last target set, or its value if none. */
  get heading(): number {
    return this.targets.at(-1)?.target ?? this.gain.value;
  }
}

class FakeBuffer implements AudioBufferLike {
  samples: Float32Array | null = null;
  constructor(readonly length: number) {}
  copyToChannel(source: Float32Array<ArrayBuffer>) {
    this.samples = source;
  }
}

class FakeSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  started = false;
  start() {
    this.started = true;
  }
}

class FakeContext implements AudioContextLike {
  readonly currentTime = 0;
  // A tiny rate keeps synthesis cheap under test.
  readonly sampleRate = 1000;
  state = "running";
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBuffer(_channels: number, length: number) {
    const buffer = new FakeBuffer(length);
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  /** The master gain is the one wired to the destination. */
  get master(): FakeGain {
    const master = this.gains.find((gain) => gain.outputs.includes(this.destination));
    if (!master) throw new Error("no master gain");
    return master;
  }
}

function fakeEnvironment(saved?: { muted: boolean; volume: number }) {
  const items = new Map<string, string>();
  if (saved) items.set(SETTINGS_KEY, JSON.stringify(saved));
  const storage: SettingsStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
  const state = {
    contexts: [] as FakeContext[],
    visibility: undefined as ((visible: boolean) => void) | undefined,
    gesture: undefined as (() => void) | undefined,
    timers: new Map<number, () => void>(),
    nextTimer: 0,
    items,
  };
  const env: SoundEnvironment = {
    createContext() {
      const context = new FakeContext();
      state.contexts.push(context);
      return context;
    },
    storage: () => storage,
    watchVisibility(onChange) {
      state.visibility = onChange;
      return {
        current: true,
        stop: () => {
          state.visibility = undefined;
        },
      };
    },
    watchGesture(onGesture) {
      state.gesture = onGesture;
      return () => {
        state.gesture = undefined;
      };
    },
    schedule(ms, task) {
      expect(ms).toBe(SUSPEND_AFTER_MS);
      const id = (state.nextTimer += 1);
      state.timers.set(id, task);
      return () => {
        state.timers.delete(id);
      };
    },
  };
  const runTimers = () => {
    const tasks = [...state.timers.values()];
    state.timers.clear();
    for (const task of tasks) task();
  };
  return { env, state, runTimers };
}

describe("sound manager", () => {
  it("starts off, with no audio context, until the player turns sound on", () => {
    const { env, state } = fakeEnvironment();
    const manager = createSoundManager(env);
    expect(manager.snapshot.status).toBe("loading");
    manager.start();
    expect(manager.snapshot).toMatchObject({ status: "off", muted: true });
    expect(state.contexts).toHaveLength(0);
    expect(state.gesture).toBeUndefined();
    expect(manager.play("death")).toBe(false);
  });

  it("turns on from the toggle, fading the night in at the chosen volume", () => {
    const { env, state } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    manager.setVolume(0.5);
    expect(state.contexts).toHaveLength(0);

    manager.setMuted(false);
    expect(manager.snapshot).toMatchObject({ status: "on", muted: false, volume: 0.5 });
    const context = state.contexts[0];
    if (!context) throw new Error("no context");
    expect(context.master.gain.value).toBe(0);
    expect(context.master.heading).toBeCloseTo(0.25);
    const ambient = context.sources[0];
    expect(ambient?.loop).toBe(true);
    expect(ambient?.started).toBe(true);
    expect(JSON.parse(state.items.get(SETTINGS_KEY) ?? "")).toEqual({ muted: false, volume: 0.5 });

    const levels = context.gains.filter((gain) => gain !== context.master);
    expect(levels.map((gain) => gain.gain.value).sort()).toEqual(
      [AMBIENT_LEVEL, STING_LEVEL].sort(),
    );
  });

  it("is locked after a reload with sound on, and unlocks on the first gesture", () => {
    const { env, state } = fakeEnvironment({ muted: false, volume: 1 });
    const manager = createSoundManager(env);
    manager.start();
    expect(manager.snapshot).toMatchObject({ status: "locked", muted: false, volume: 1 });
    expect(state.contexts).toHaveLength(0);
    expect(manager.play("hour-cleared")).toBe(false);

    state.gesture?.();
    expect(manager.snapshot.status).toBe("on");
    expect(state.gesture).toBeUndefined();
    expect(state.contexts).toHaveLength(1);
    expect(manager.play("hour-cleared")).toBe(true);
  });

  it("mutes with a fade, then suspends the context, and resumes on unmute", () => {
    const { env, state, runTimers } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    manager.setMuted(false);
    const context = state.contexts[0];
    if (!context) throw new Error("no context");

    manager.setMuted(true);
    expect(manager.snapshot.status).toBe("off");
    expect(context.master.targets.at(-1)).toEqual({ target: 0, timeConstant: FADE_OUT_SECONDS });
    expect(context.state).toBe("running");
    runTimers();
    expect(context.state).toBe("suspended");
    expect(manager.play("candle-out")).toBe(false);

    manager.setMuted(false);
    expect(context.state).toBe("running");
    expect(state.contexts).toHaveLength(1);
    // The ambient loop is started once and survives a mute.
    expect(context.sources.filter((source) => source.loop)).toHaveLength(1);
  });

  it("unmuting before the suspend lands cancels it", () => {
    const { env, state, runTimers } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    manager.setMuted(false);
    manager.setMuted(true);
    manager.setMuted(false);
    runTimers();
    expect(state.contexts[0]?.state).toBe("running");
  });

  it("ducks and suspends while the tab is hidden, and comes back when it returns", () => {
    const { env, state, runTimers } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    manager.setMuted(false);
    const context = state.contexts[0];
    if (!context) throw new Error("no context");

    state.visibility?.(false);
    expect(context.master.heading).toBe(0);
    expect(manager.play("death")).toBe(false);
    runTimers();
    expect(context.state).toBe("suspended");
    expect(manager.snapshot.status).toBe("on");

    state.visibility?.(true);
    expect(context.state).toBe("running");
    expect(context.master.heading).toBeCloseTo(0.36);
  });

  it("caches each sting's buffer and starts a fresh source per play", () => {
    const { env, state } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    manager.setMuted(false);
    const context = state.contexts[0];
    if (!context) throw new Error("no context");
    const buffersBefore = context.buffers.length;

    expect(manager.play("death")).toBe(true);
    expect(manager.play("death")).toBe(true);
    expect(context.buffers.length).toBe(buffersBefore + 1);
    const stings = context.sources.filter((source) => !source.loop);
    expect(stings).toHaveLength(2);
    expect(stings.every((source) => source.started)).toBe(true);
  });

  it("notifies subscribers only on real changes", () => {
    const { env } = fakeEnvironment();
    const manager = createSoundManager(env);
    manager.start();
    let calls = 0;
    manager.subscribe(() => (calls += 1));
    manager.setVolume(0.6);
    expect(calls).toBe(0);
    manager.setVolume(0.8);
    expect(calls).toBe(1);
  });

  it("closes the context on teardown", () => {
    const { env, state } = fakeEnvironment();
    const manager = createSoundManager(env);
    const stop = manager.start();
    manager.setMuted(false);
    stop();
    expect(state.contexts[0]?.state).toBe("closed");
    expect(state.visibility).toBeUndefined();
    expect(manager.snapshot.status).toBe("locked");
  });
});
