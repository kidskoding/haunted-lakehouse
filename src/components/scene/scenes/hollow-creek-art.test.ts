import { describe, expect, it } from "vitest";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  FRAME_TOP,
  frameCss,
  ghost,
  HOLLOW_REST,
  HORIZON,
  lightLevel,
  reflectLight,
  MIN_HEIGHT_SHARE,
  placeDrawing,
  town,
  type Light,
  type Polygon,
} from "./hollow-creek-art";

function xRange(polygon: Polygon): [number, number] {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  return [Math.min(...xs), Math.max(...xs)];
}

const lights = town.flatMap((building) => building.lights);

describe("placeDrawing", () => {
  it("covers a wide host's full width and sits on its bottom edge", () => {
    const { scale, x, y } = placeDrawing(1920, 1080);
    expect(DESIGN_WIDTH * scale).toBeGreaterThanOrEqual(1920);
    expect(x).toBeCloseTo((1920 - DESIGN_WIDTH * scale) / 2);
    expect(y + DESIGN_HEIGHT * scale).toBeCloseTo(1080);
  });

  it("frames at least its share of a tall host's height", () => {
    const { scale } = placeDrawing(375, 812);
    expect((DESIGN_HEIGHT - FRAME_TOP) * scale).toBeCloseTo(812 * MIN_HEIGHT_SHARE);
  });

  it("matches the CSS the static drawing is placed with", () => {
    const cqh = Number(/(\d+(?:\.\d+)?)cqh/.exec(frameCss.width)?.[1]);
    // At 1000×1000 the height term wins; the CSS width must equal the scaled design width.
    const { scale } = placeDrawing(1000, 1000);
    expect((cqh / 100) * 1000).toBeCloseTo(DESIGN_WIDTH * scale);
  });
});

describe("the Hollow", () => {
  it("has nothing but a foundation on the shore above its reflection", () => {
    const [ghostLeft, ghostRight] = xRange(ghost.shapes[0] ?? []);
    const onItsPlot = town
      .flatMap((building) => building.shapes)
      .filter((shape) => {
        const [left, right] = xRange(shape);
        return right - left < DESIGN_WIDTH && right > ghostLeft && left < ghostRight;
      });
    expect(onItsPlot.length).toBeGreaterThan(0);
    for (const shape of onItsPlot) {
      const ys = shape.filter((_, i) => i % 2 === 1);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(6);
    }
  });

  it("shows its windows out in the water, clear of the shoreline", () => {
    for (const light of ghost.lights) {
      expect(reflectLight(light).y).toBeGreaterThan(HORIZON + 12);
    }
  });

  it("breathes slowly and holds still under reduced motion", () => {
    const window = ghost.lights[0] as Light;
    expect(lightLevel(window, 0, true)).toBe(HOLLOW_REST);
    const levels = Array.from({ length: 40 }, (_, i) => lightLevel(window, i * 250, false));
    expect(Math.min(...levels)).toBeGreaterThan(0);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.2);
  });
});

describe("town lights", () => {
  it("are all on, and steady, under reduced motion", () => {
    for (const light of lights) expect(lightLevel(light, 12_345, true)).toBe(1);
  });

  it("only go out when they are restless", () => {
    const samples = Array.from({ length: 400 }, (_, i) => i * 50);
    for (const light of lights) {
      const goesOut = samples.some((t) => lightLevel(light, t, false) === 0);
      expect(goesOut).toBe(light.restless);
    }
  });

  it("include restless ones, so the town is never a still picture", () => {
    expect(lights.filter((light) => light.restless).length).toBeGreaterThan(2);
  });
});
