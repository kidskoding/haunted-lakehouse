import { describe, expect, it, vi } from "vitest";
import {
  MAX_FRAME_DELTA_MS,
  MAX_RESOLUTION,
  startScene,
  type SceneEnvironment,
  type SceneRuntime,
} from "./controller";
import type { SceneFrame, SceneHandle, SceneModule, SceneSize, SceneState } from "./types";

interface FakeApp {
  readonly id: string;
}

function fakeRuntime() {
  let tick: ((deltaMs: number) => void) | undefined;
  const runtime = {
    app: { id: "app" },
    running: false,
    destroyed: false,
    renders: 0,
    resizes: [] as { size: SceneSize; resolution: number }[],
    onTick(callback: (deltaMs: number) => void) {
      tick = callback;
    },
    start() {
      runtime.running = true;
    },
    stop() {
      runtime.running = false;
    },
    resize(size: SceneSize, resolution: number) {
      runtime.resizes.push({ size, resolution });
    },
    renderNow() {
      runtime.renders += 1;
    },
    destroy() {
      runtime.destroyed = true;
    },
    /** Advances one ticker frame, as PixiJS would while started. */
    frame(deltaMs: number) {
      if (runtime.running) tick?.(deltaMs);
    },
  } satisfies SceneRuntime<FakeApp> & Record<string, unknown>;
  return runtime;
}

function fakeEnvironment(initial: { reduce?: boolean; visible?: boolean; webgl?: boolean } = {}) {
  const listeners = {
    motion: undefined as ((reduce: boolean) => void) | undefined,
    visibility: undefined as ((visible: boolean) => void) | undefined,
    size: undefined as ((size: SceneSize) => void) | undefined,
  };
  const stopped = { motion: false, visibility: false, size: false };
  const screen = { dpr: 1 };
  return {
    screen,
    listeners,
    stopped,
    env: {
      supportsWebGL: () => initial.webgl ?? true,
      devicePixelRatio: () => screen.dpr,
      watchReducedMotion(onChange) {
        listeners.motion = onChange;
        return {
          current: initial.reduce ?? false,
          stop: () => {
            stopped.motion = true;
          },
        };
      },
      watchVisibility(onChange) {
        listeners.visibility = onChange;
        return {
          current: initial.visible ?? true,
          stop: () => {
            stopped.visibility = true;
          },
        };
      },
      watchSize(onChange) {
        listeners.size = onChange;
        return {
          current: { width: 640, height: 360 },
          stop: () => {
            stopped.size = true;
          },
        };
      },
    } satisfies SceneEnvironment,
  };
}

function fakeScene() {
  const frames: SceneFrame[] = [];
  const handle = {
    render: vi.fn((frame: SceneFrame) => {
      frames.push(frame);
    }),
    resize: vi.fn((size: SceneSize) => size),
    update: vi.fn((props: string) => props),
    destroy: vi.fn(),
  } satisfies SceneHandle<string>;
  const sceneModule = {
    mount: vi.fn<SceneModule<FakeApp, string>["mount"]>(() => handle),
  } satisfies SceneModule<FakeApp, string>;
  return { module: sceneModule, handle, frames };
}

function setup(initial: Parameters<typeof fakeEnvironment>[0] = {}) {
  const runtime = fakeRuntime();
  const environment = fakeEnvironment(initial);
  const scene = fakeScene();
  const states: SceneState[] = [];
  const createRuntime = vi.fn<(size: SceneSize, resolution: number) => Promise<typeof runtime>>(
    () => Promise.resolve(runtime),
  );
  const controller = startScene<FakeApp, string>({
    loadScene: () => Promise.resolve(scene.module),
    createRuntime,
    env: environment.env,
    props: "first",
    onStateChange: (state) => states.push(state),
  });
  return { runtime, environment, scene, states, controller, createRuntime };
}

/** Lets the controller's pending loads settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("startScene", () => {
  it("loads, mounts the scene with its props, and starts the ticker", async () => {
    const { runtime, scene, states, createRuntime } = setup();
    expect(states).toEqual(["loading"]);
    await settle();

    expect(createRuntime).toHaveBeenCalledWith({ width: 640, height: 360 }, 1);
    expect(scene.module.mount).toHaveBeenCalledWith(runtime.app, {
      size: { width: 640, height: 360 },
      props: "first",
      reducedMotion: false,
    });
    expect(runtime.running).toBe(true);
    expect(states).toEqual(["loading", "running"]);
  });

  it("advances scene time on each tick, clamping long frames", async () => {
    const { runtime, scene } = setup();
    await settle();
    runtime.frame(16);
    runtime.frame(5000);
    expect(scene.frames).toEqual([
      { timeMs: 16, reducedMotion: false },
      { timeMs: 16 + MAX_FRAME_DELTA_MS, reducedMotion: false },
    ]);
  });

  it("never starts the ticker under reduced motion and draws one still frame", async () => {
    const { runtime, scene, states } = setup({ reduce: true });
    await settle();

    expect(runtime.running).toBe(false);
    expect(states).toEqual(["loading", "static"]);
    expect(scene.frames).toEqual([{ timeMs: 0, reducedMotion: true }]);
    expect(runtime.renders).toBe(1);
  });

  it("follows reduced motion as it changes", async () => {
    const { runtime, environment, scene, states } = setup();
    await settle();
    runtime.frame(40);

    environment.listeners.motion?.(true);
    expect(runtime.running).toBe(false);
    expect(scene.frames.at(-1)).toEqual({ timeMs: 40, reducedMotion: true });

    environment.listeners.motion?.(false);
    expect(runtime.running).toBe(true);
    expect(states).toEqual(["loading", "running", "static", "running"]);
  });

  it("pauses while the tab is hidden and resumes where it left off", async () => {
    const { runtime, environment, scene, states } = setup();
    await settle();
    runtime.frame(30);

    environment.listeners.visibility?.(false);
    expect(runtime.running).toBe(false);
    runtime.frame(30);

    environment.listeners.visibility?.(true);
    runtime.frame(30);
    expect(scene.frames.map((frame) => frame.timeMs)).toEqual([30, 60]);
    expect(states).toEqual(["loading", "running", "paused", "running"]);
  });

  it("starts paused when the tab is hidden at load", async () => {
    const { runtime, states } = setup({ visible: false });
    await settle();
    expect(runtime.running).toBe(false);
    expect(states).toEqual(["loading", "paused"]);
  });

  it("resizes the renderer at a capped device pixel ratio and tells the scene", async () => {
    const { runtime, environment, scene } = setup();
    await settle();
    environment.screen.dpr = 3;
    environment.listeners.size?.({ width: 800, height: 450 });

    expect(runtime.resizes).toEqual([
      { size: { width: 800, height: 450 }, resolution: MAX_RESOLUTION },
    ]);
    expect(scene.handle.resize).toHaveBeenCalledWith({ width: 800, height: 450 });
    expect(runtime.renders).toBe(0);
  });

  it("applies a resize that happened while loading before mounting", async () => {
    const { runtime, environment, scene } = setup();
    environment.listeners.size?.({ width: 300, height: 200 });
    await settle();

    expect(runtime.resizes).toEqual([{ size: { width: 300, height: 200 }, resolution: 1 }]);
    expect(scene.module.mount.mock.calls[0]?.[1].size).toEqual({ width: 300, height: 200 });
  });

  it("redraws the still frame after a resize under reduced motion", async () => {
    const { runtime, environment } = setup({ reduce: true });
    await settle();
    environment.listeners.size?.({ width: 320, height: 180 });
    expect(runtime.renders).toBe(2);
  });

  it("passes prop updates to the scene and redraws a still frame", async () => {
    const { runtime, scene, controller } = setup({ reduce: true });
    await settle();
    controller.update("second");
    expect(scene.handle.update).toHaveBeenCalledWith("second");
    expect(runtime.renders).toBe(2);
  });

  it("mounts with the latest props when they change during loading", async () => {
    const { scene, controller } = setup();
    controller.update("early");
    await settle();
    expect(scene.module.mount.mock.calls[0]?.[1].props).toBe("early");
  });

  it("destroys the scene, the app, and every listener on dispose", async () => {
    const { runtime, environment, scene, controller } = setup();
    await settle();
    controller.dispose();

    expect(scene.handle.destroy).toHaveBeenCalledOnce();
    expect(runtime.destroyed).toBe(true);
    expect(runtime.running).toBe(false);
    expect(environment.stopped).toEqual({ motion: true, visibility: true, size: true });

    controller.dispose();
    expect(scene.handle.destroy).toHaveBeenCalledOnce();
  });

  it("destroys an app that finishes loading after dispose, without mounting", async () => {
    const { runtime, environment, scene, controller, states } = setup();
    controller.dispose();
    await settle();

    expect(scene.module.mount).not.toHaveBeenCalled();
    expect(runtime.destroyed).toBe(true);
    expect(environment.stopped).toEqual({ motion: true, visibility: true, size: true });
    expect(states).toEqual(["loading"]);
  });

  it("survives a StrictMode-style mount, dispose, mount", async () => {
    const first = setup();
    first.controller.dispose();
    const second = setup();
    await settle();

    expect(first.runtime.destroyed).toBe(true);
    expect(first.scene.module.mount).not.toHaveBeenCalled();
    expect(second.runtime.running).toBe(true);
    expect(second.runtime.destroyed).toBe(false);
  });

  it("falls back without loading anything when WebGL is unavailable", async () => {
    const { createRuntime, states } = setup({ webgl: false });
    await settle();
    expect(createRuntime).not.toHaveBeenCalled();
    expect(states).toEqual(["loading", "fallback"]);
  });

  it("falls back and releases listeners when the app fails to start", async () => {
    const environment = fakeEnvironment();
    const states: SceneState[] = [];
    startScene<FakeApp, string>({
      loadScene: () => Promise.resolve(fakeScene().module),
      createRuntime: () => Promise.reject(new Error("no context")),
      env: environment.env,
      props: "first",
      onStateChange: (state) => states.push(state),
    });
    await settle();
    expect(states).toEqual(["loading", "fallback"]);
    expect(environment.stopped).toEqual({ motion: true, visibility: true, size: true });
  });

  it("destroys a started app when the scene module fails to load", async () => {
    const runtime = fakeRuntime();
    const states: SceneState[] = [];
    startScene<FakeApp, string>({
      loadScene: () => Promise.reject(new Error("chunk failed")),
      createRuntime: () => Promise.resolve(runtime),
      env: fakeEnvironment().env,
      props: "first",
      onStateChange: (state) => states.push(state),
    });
    await settle();
    expect(runtime.destroyed).toBe(true);
    expect(states).toEqual(["loading", "fallback"]);
  });

  it("destroys the app when the scene throws while mounting", async () => {
    const runtime = fakeRuntime();
    const states: SceneState[] = [];
    startScene<FakeApp, string>({
      loadScene: () =>
        Promise.resolve({
          mount: () => {
            throw new Error("bad scene");
          },
        }),
      createRuntime: () => Promise.resolve(runtime),
      env: fakeEnvironment().env,
      props: "first",
      onStateChange: (state) => states.push(state),
    });
    await settle();
    expect(runtime.destroyed).toBe(true);
    expect(states).toEqual(["loading", "fallback"]);
  });
});
