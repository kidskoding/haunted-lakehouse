/** Pixel size of a scene's drawing surface, in CSS pixels. */
export interface SceneSize {
  readonly width: number;
  readonly height: number;
}

/** One frame of scene time, handed to a mounted scene to draw. */
export interface SceneFrame {
  /** Scene time in milliseconds. It only advances while the scene is running, so a pause resumes where it left off. */
  readonly timeMs: number;
  /** When true the scene draws its calm, static equivalent (art direction §7.3) instead of a moment in motion. */
  readonly reducedMotion: boolean;
}

/** What a scene module gets when it mounts. */
export interface SceneContext<P> {
  readonly size: SceneSize;
  readonly props: P;
  readonly reducedMotion: boolean;
}

/** A mounted scene. The shell owns time, sizing, and teardown; the scene only draws. */
export interface SceneHandle<P> {
  /** Draws the scene at the given frame. Called every tick while running, and once per static frame. */
  render(frame: SceneFrame): void;
  resize?(size: SceneSize): void;
  update?(props: P): void;
  /** Releases everything the scene created. The shell destroys the app itself afterwards. */
  destroy(): void;
}

/**
 * A pluggable scene (clock, candles, timeline, tombstone). `TApp` is the scene library's
 * application object, a PixiJS `Application` in the app.
 */
export interface SceneModule<TApp, P> {
  mount(app: TApp, ctx: SceneContext<P>): SceneHandle<P>;
}

/**
 * Loads a scene module on demand. Scene modules import the scene library directly, so they
 * must only ever be reached through a loader like this, which keeps the library out of the
 * initial bundle. Define loaders at module scope so their identity is stable across renders.
 */
export type SceneLoader<TApp, P> = () => Promise<SceneModule<TApp, P>>;

/**
 * Where a scene is in its life.
 * - `loading`: the scene library is still being fetched; the static fallback shows.
 * - `running`: the ticker is animating the scene.
 * - `paused`: the tab is hidden, so the ticker is stopped to save battery.
 * - `static`: reduced motion is on; one still frame is drawn and the ticker never runs.
 * - `fallback`: WebGL is unavailable or the scene failed to start; the static fallback stays.
 */
export type SceneState = "loading" | "running" | "paused" | "static" | "fallback";
