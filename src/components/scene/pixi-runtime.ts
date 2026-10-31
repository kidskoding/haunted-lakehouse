import type { Application } from "pixi.js";
import type { SceneRuntime } from "./controller";
import type { SceneSize } from "./types";

/**
 * Creates a PixiJS application inside `host`. PixiJS is fetched here with a dynamic
 * `import()`, so it lands in its own chunk and never weighs on first paint.
 */
export async function createPixiRuntime(
  host: HTMLElement,
  size: SceneSize,
  resolution: number,
): Promise<SceneRuntime<Application>> {
  const { Application } = await import("pixi.js");
  const app = new Application();
  try {
    await app.init({
      width: size.width,
      height: size.height,
      resolution,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      preference: "webgl",
      // The controller decides when time runs; nothing animates until it says so.
      autoStart: false,
    });
  } catch (error) {
    // A half-initialised app may not tear down cleanly; the init error is the one that matters.
    try {
      app.destroy();
    } catch {
      // Already reporting the init failure.
    }
    throw error;
  }
  app.canvas.style.display = "block";
  host.appendChild(app.canvas);

  return {
    app,
    onTick(callback) {
      app.ticker.add((ticker) => {
        callback(ticker.deltaMS);
      });
    },
    start() {
      app.start();
    },
    stop() {
      app.stop();
    },
    resize({ width, height }, nextResolution) {
      app.renderer.resize(width, height, nextResolution);
    },
    renderNow() {
      app.render();
    },
    destroy() {
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    },
  };
}
