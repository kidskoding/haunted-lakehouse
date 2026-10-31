import { Container, Graphics, type Application } from "pixi.js";
import { createFlicker } from "../motion";
import type { SceneModule } from "../types";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  dock,
  ghost,
  lakeBands,
  lightLevel,
  moon,
  moonPath,
  palette,
  placeDrawing,
  pumpkin,
  reeds,
  reflectLight,
  reflectPolygon,
  ridgeShape,
  rippleOffset,
  ripples,
  skyBands,
  starLevel,
  stars,
  town,
  type Light,
} from "./hollow-creek-art";

const lightColor = { window: palette.window, porch: palette.porch, hollow: palette.hollow };

/** The scene takes no props: the town is the same for everyone at dusk. */
export type HollowCreekProps = Record<string, never>;

function bands(target: Graphics, list: readonly { top: number; color: string }[], bottom: number) {
  list.forEach((band, i) => {
    const next = list[i + 1]?.top ?? bottom;
    target.rect(0, band.top, DESIGN_WIDTH, next - band.top).fill({ color: band.color });
  });
  return target;
}

function lightGraphic(light: Light): Graphics {
  return new Graphics()
    .rect(light.x, light.y, light.w, light.h)
    .fill({ color: lightColor[light.kind] });
}

/** Seed for the pumpkin's candle, fixed so every visit flickers alike. */
const PUMPKIN_SEED = 0x9a4b;

/**
 * Hollow Creek at dusk: the town across the lake, its lights flickering and now and then
 * going out, the water drifting, and in the reflection one house that is not on the shore.
 * Drawn from the same data as `HollowCreekDrawing`, so it takes over from it seamlessly.
 */
export const hollowCreekScene: SceneModule<Application, HollowCreekProps> = {
  mount(app, ctx) {
    const root = new Container();
    const lights = town.flatMap((building) => building.lights);
    const shapes = town.flatMap((building) => building.shapes);

    const backdrop = new Graphics();
    for (const band of skyBands) backdrop.poly([...band.points]).fill({ color: band.color });
    const starGraphics = stars.map((star) => {
      const g = new Graphics().circle(star.x, star.y, star.r).fill({ color: palette.star });
      return { star, g };
    });
    backdrop.circle(moon.x, moon.y, moon.r).fill({ color: palette.moon });
    const ridge = new Graphics().poly([...ridgeShape]).fill({ color: palette.ridge });
    const lake = bands(new Graphics(), lakeBands, DESIGN_HEIGHT);
    for (const streak of moonPath) {
      lake.rect(streak.x, streak.y, streak.w, 2).fill({ color: palette.moon, alpha: streak.alpha });
    }

    const reflection = new Graphics()
      .poly([...reflectPolygon(ridgeShape)])
      .fill({ color: palette.ridge });
    for (const shape of [...shapes, ...ghost.shapes]) {
      reflection.poly([...reflectPolygon(shape)]).fill({ color: palette.foreground });
    }
    reflection.alpha = 0.55;

    const reflectedLights = [...lights, ...ghost.lights].map((light) => ({
      light,
      g: lightGraphic(reflectLight(light)),
    }));
    const rippleGraphics = ripples.map((ripple) => ({
      ripple,
      g: new Graphics().rect(ripple.x, ripple.y, ripple.length, 1.5).fill({ color: ripple.color }),
    }));

    const silhouettes = new Graphics();
    for (const shape of shapes) silhouettes.poly([...shape]).fill({ color: palette.silhouette });
    const shoreLights = lights.map((light) => ({ light, g: lightGraphic(light) }));

    const foreground = new Graphics();
    for (const reed of reeds) {
      foreground
        .moveTo(reed.x, DESIGN_HEIGHT)
        .lineTo(reed.x + 4, reed.top)
        .stroke({ width: 3, color: palette.foreground, cap: "round" });
    }
    for (const plank of dock) foreground.poly([...plank]).fill({ color: palette.foreground });
    foreground
      .ellipse(pumpkin.body.x, pumpkin.body.y, pumpkin.body.rx, pumpkin.body.ry)
      .fill({ color: palette.foreground })
      .poly([...pumpkin.stem])
      .fill({ color: palette.foreground });
    const face = new Graphics();
    for (const cut of pumpkin.face) face.poly([...cut]).fill({ color: palette.window });
    const pumpkinFlicker = createFlicker(PUMPKIN_SEED);

    root.addChild(
      backdrop,
      ...starGraphics.map(({ g }) => g),
      ridge,
      lake,
      reflection,
      ...reflectedLights.map(({ g }) => g),
      ...rippleGraphics.map(({ g }) => g),
      silhouettes,
      ...shoreLights.map(({ g }) => g),
      foreground,
      face,
    );
    app.stage.addChild(root);

    const layout = (size: { width: number; height: number }) => {
      const { scale, x, y } = placeDrawing(size.width, size.height);
      root.scale.set(scale);
      root.position.set(x, y);
    };
    layout(ctx.size);

    return {
      render({ timeMs, reducedMotion }) {
        for (const { star, g } of starGraphics) g.alpha = starLevel(star, timeMs, reducedMotion);
        for (const { light, g } of shoreLights) g.alpha = lightLevel(light, timeMs, reducedMotion);
        for (const { light, g } of reflectedLights) {
          const level = lightLevel(light, timeMs, reducedMotion);
          // The Hollow's window is as bright in the water as it would be on the shore.
          g.alpha = light.kind === "hollow" ? level : level * 0.4;
        }
        for (const { ripple, g } of rippleGraphics) {
          g.x = rippleOffset(ripple, timeMs, reducedMotion);
        }
        face.alpha = reducedMotion ? 1 : 0.85 + pumpkinFlicker(timeMs) * 0.15;
      },
      resize: layout,
      destroy() {
        app.stage.removeChild(root);
        root.destroy({ children: true });
      },
    };
  },
};
