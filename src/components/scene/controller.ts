import type { SceneHandle, SceneLoader, SceneSize, SceneState } from "./types";

/** The slice of a scene library application the controller drives. */
export interface SceneRuntime<TApp> {
  readonly app: TApp;
  /** Registers the per-frame callback; the delta is in milliseconds. */
  onTick(callback: (deltaMs: number) => void): void;
  start(): void;
  stop(): void;
  resize(size: SceneSize, resolution: number): void;
  /** Renders once, outside the ticker. Used for static frames. */
  renderNow(): void;
  /** Destroys the app and removes its canvas from the page. */
  destroy(): void;
}

/** Browser facilities the controller depends on, injected so the lifecycle is testable without a DOM. */
export interface SceneEnvironment {
  supportsWebGL(): boolean;
  devicePixelRatio(): number;
  /** Current `prefers-reduced-motion: reduce` value; calls back on every change. */
  watchReducedMotion(onChange: (reduce: boolean) => void): {
    readonly current: boolean;
    stop(): void;
  };
  /** Current page visibility; calls back on every change. */
  watchVisibility(onChange: (visible: boolean) => void): {
    readonly current: boolean;
    stop(): void;
  };
  /** Current host size; calls back whenever the host is resized. */
  watchSize(onChange: (size: SceneSize) => void): { readonly current: SceneSize; stop(): void };
}

export interface SceneControllerOptions<TApp, P> {
  readonly loadScene: SceneLoader<TApp, P>;
  readonly createRuntime: (size: SceneSize, resolution: number) => Promise<SceneRuntime<TApp>>;
  readonly env: SceneEnvironment;
  readonly props: P;
  readonly onStateChange: (state: SceneState) => void;
}

export interface SceneController<P> {
  update(props: P): void;
  dispose(): void;
}

/** Sharp enough for any display we target, without paying 3x fill cost on dense phones. */
export const MAX_RESOLUTION = 2;

/** A long frame (a backgrounded tab, a debugger pause) must not fast-forward the scene. */
export const MAX_FRAME_DELTA_MS = 100;

/**
 * Starts a scene: loads the library and scene module, mounts the scene, and keeps its
 * ticker in step with reduced motion, page visibility, and host size until disposed.
 * Disposing at any point, including mid-load, leaves nothing running.
 */
export function startScene<TApp, P>(options: SceneControllerOptions<TApp, P>): SceneController<P> {
  const { env, onStateChange } = options;
  let props = options.props;
  let disposed = false;
  let state: SceneState = "loading";
  let mounted: { runtime: SceneRuntime<TApp>; handle: SceneHandle<P> } | undefined;
  const stops: (() => void)[] = [];
  let reducedMotion = false;
  let visible = true;
  let timeMs = 0;

  const setState = (next: SceneState) => {
    if (next === state) return;
    state = next;
    onStateChange(next);
  };

  const drawStill = () => {
    if (!mounted) return;
    mounted.handle.render({ timeMs, reducedMotion: true });
    mounted.runtime.renderNow();
  };

  const applyMotion = () => {
    if (!mounted) return;
    if (reducedMotion) {
      mounted.runtime.stop();
      drawStill();
      setState("static");
    } else if (!visible) {
      mounted.runtime.stop();
      setState("paused");
    } else {
      mounted.runtime.start();
      setState("running");
    }
  };

  const resolution = () => Math.min(Math.max(env.devicePixelRatio(), 1), MAX_RESOLUTION);

  const teardown = () => {
    for (const stop of stops.splice(0)) stop();
    if (mounted) {
      const { runtime, handle } = mounted;
      mounted = undefined;
      runtime.stop();
      handle.destroy();
      runtime.destroy();
    }
  };

  const fail = () => {
    teardown();
    setState("fallback");
  };

  const boot = async () => {
    if (!env.supportsWebGL()) {
      setState("fallback");
      return;
    }
    const motion = env.watchReducedMotion((reduce) => {
      reducedMotion = reduce;
      applyMotion();
    });
    stops.push(() => {
      motion.stop();
    });
    const visibility = env.watchVisibility((isVisible) => {
      visible = isVisible;
      applyMotion();
    });
    stops.push(() => {
      visibility.stop();
    });
    reducedMotion = motion.current;
    visible = visibility.current;

    const sizeWatch = env.watchSize((size) => {
      latestSize = size;
      if (!mounted) return;
      mounted.runtime.resize(size, resolution());
      mounted.handle.resize?.(size);
      if (state === "static") drawStill();
    });
    stops.push(() => {
      sizeWatch.stop();
    });

    let latestSize = sizeWatch.current;
    const initialSize = latestSize;
    const runtimePromise = options.createRuntime(initialSize, resolution());
    const scenePromise = Promise.resolve().then(options.loadScene);
    const [runtime, scene] = await Promise.all([runtimePromise, scenePromise]).catch(
      async (error: unknown) => {
        // The other half may still have succeeded; it must not outlive the failure.
        await runtimePromise
          .then((runtime) => {
            runtime.destroy();
          })
          .catch(() => undefined);
        throw error;
      },
    );
    if (disposed) {
      runtime.destroy();
      return;
    }
    // The host may have been resized while the library loaded.
    if (latestSize !== initialSize) runtime.resize(latestSize, resolution());
    let handle: SceneHandle<P>;
    try {
      handle = scene.mount(runtime.app, { size: latestSize, props, reducedMotion });
    } catch (error) {
      runtime.destroy();
      throw error;
    }
    mounted = { runtime, handle };
    runtime.onTick((deltaMs) => {
      timeMs += Math.min(deltaMs, MAX_FRAME_DELTA_MS);
      handle.render({ timeMs, reducedMotion: false });
    });
    applyMotion();
  };

  // A reused component may still show a previous scene's state, so announce the start.
  onStateChange(state);
  boot().catch(() => {
    if (!disposed) fail();
  });

  return {
    update(next) {
      props = next;
      if (!mounted) return;
      mounted.handle.update?.(next);
      if (state === "static") drawStill();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      teardown();
    },
  };
}
