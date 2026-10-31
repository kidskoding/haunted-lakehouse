import { Container, Graphics, type Application } from "pixi.js";
import { createFlicker, easeInOut } from "../motion";
import type { SceneModule, SceneSize } from "../types";
import {
  clockHandHour,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  FLICKER_AMPLITUDE,
  GUTTER_LEAN,
  palette,
  START_HOUR,
  SWEEP_MS,
  sweepTarget,
  type CandleClockProps,
} from "./candle-clock-art";

const CLOCK_X = 104;
const CLOCK_Y = 90;
const CLOCK_RADIUS = 62;
const CANDLE_X = 226;
const CANDLE_TOP = 100;
const CANDLE_HEIGHT = 62;

/** Fixed seeds keep the flame identical across reloads and test runs. */
const SHAPE_SEED = 0x0c4e;
const LEAN_SEED = 0x1eaf;

function drawDial(): Graphics {
  const dial = new Graphics()
    .circle(0, 0, CLOCK_RADIUS)
    .fill({ color: palette.dial })
    .stroke({ width: 2, color: palette.dialRim });
  for (let hour = 0; hour < 12; hour += 1) {
    const angle = (hour / 12) * Math.PI * 2;
    const inner = hour % 3 === 0 ? CLOCK_RADIUS - 12 : CLOCK_RADIUS - 7;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    dial
      .moveTo(sin * inner, -cos * inner)
      .lineTo(sin * (CLOCK_RADIUS - 3), -cos * (CLOCK_RADIUS - 3));
  }
  return dial.stroke({ width: 2, color: palette.tick, cap: "round" });
}

function drawHand(): Graphics {
  const tip = -(CLOCK_RADIUS - 14);
  return new Graphics()
    .moveTo(0, 8)
    .lineTo(0, tip)
    .stroke({ width: 3, color: palette.flame, cap: "round" })
    .circle(0, tip, 9)
    .fill({ color: palette.flame, alpha: 0.22 })
    .circle(0, tip, 3)
    .fill({ color: palette.glow })
    .circle(0, 0, 5)
    .fill({ color: palette.flame });
}

function drawCandle(): Graphics {
  return new Graphics()
    .roundRect(-11, 0, 22, CANDLE_HEIGHT, 3)
    .fill({ color: palette.wax })
    .rect(5, 2, 4, CANDLE_HEIGHT - 4)
    .fill({ color: palette.waxShade, alpha: 0.6 })
    .moveTo(0, 0)
    .lineTo(0, -6)
    .stroke({ width: 2, color: palette.wick, cap: "round" });
}

/** A teardrop with its base at the origin, so scaling stretches it up from the wick. */
function teardrop(target: Graphics, height: number, width: number): Graphics {
  const w = width / 2;
  return target
    .moveTo(0, -height)
    .bezierCurveTo(w * 0.5, -height * 0.55, w * 1.1, -height * 0.3, w * 0.85, -height * 0.12)
    .bezierCurveTo(w * 0.6, height * 0.04, -w * 0.6, height * 0.04, -w * 0.85, -height * 0.12)
    .bezierCurveTo(-w * 1.1, -height * 0.3, -w * 0.5, -height * 0.55, 0, -height)
    .closePath();
}

function drawHalo(): Graphics {
  const halo = new Graphics();
  // Many faint stacked discs fake a soft radial falloff without a blur filter's cost.
  const rings = 14;
  for (let i = 0; i < rings; i += 1) {
    const radius = 52 * (1 - i / rings);
    halo
      .circle(0, 0, radius)
      .fill({ color: i < rings / 2 ? palette.ember : palette.flame, alpha: 0.022 });
  }
  return halo;
}

/**
 * A flickering candle beside a night clock. The hand sweeps hour to hour on its own, or
 * follows the `hour` prop when one is given.
 */
export const candleClockScene: SceneModule<Application, CandleClockProps> = {
  mount(app, ctx) {
    let props = ctx.props;
    let shownHour = props.hour ?? START_HOUR;
    // The sweep starts on the first frame drawn after the hour changes.
    let sweep: { from: number; to: number; startMs: number | null } = {
      from: shownHour,
      to: shownHour,
      startMs: null,
    };
    const handHour = (timeMs: number, reducedMotion: boolean): number => {
      if (props.hour === undefined) {
        const hour = clockHandHour(timeMs);
        return reducedMotion ? Math.round(hour) : hour;
      }
      sweep.startMs ??= timeMs;
      const progress = reducedMotion ? 1 : Math.min(1, (timeMs - sweep.startMs) / SWEEP_MS);
      shownHour = sweep.from + (sweep.to - sweep.from) * easeInOut(progress);
      return shownHour;
    };
    const shapeNoise = createFlicker(SHAPE_SEED);
    const leanNoise = createFlicker(LEAN_SEED, 6);

    const root = new Container();
    const art = new Container();
    art.position.set(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2);
    root.addChild(art);

    const clock = new Container();
    clock.position.set(CLOCK_X, CLOCK_Y);
    const hand = drawHand();
    clock.addChild(drawDial(), hand);

    const candle = new Container();
    candle.position.set(CANDLE_X, CANDLE_TOP);
    const halo = drawHalo();
    halo.position.set(0, -22);
    const flame = new Container();
    flame.position.set(0, -5);
    flame.addChild(
      teardrop(new Graphics(), 34, 17).fill({ color: palette.flame }),
      teardrop(new Graphics(), 16, 8).fill({ color: palette.glow }),
    );
    candle.addChild(halo, drawCandle(), flame);

    art.addChild(clock, candle);
    app.stage.addChild(root);

    const layout = ({ width, height }: SceneSize) => {
      root.position.set(width / 2, height / 2);
      root.scale.set(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT));
    };
    layout(ctx.size);

    return {
      render({ timeMs, reducedMotion }) {
        const gutter = props.flame === "guttering";
        const lean = gutter ? GUTTER_LEAN : 0;
        if (reducedMotion) {
          // The calm equivalent: the hand settles on its hour and the flame holds still.
          hand.rotation = (handHour(timeMs, true) / 12) * Math.PI * 2;
          flame.scale.set(1, gutter ? 0.85 : 1);
          flame.skew.x = lean;
          halo.alpha = 0.8;
          halo.scale.set(1);
          return;
        }
        hand.rotation = (handHour(timeMs, false) / 12) * Math.PI * 2;
        const amplitude = FLICKER_AMPLITUDE[props.flame];
        const n = shapeNoise(timeMs) * amplitude;
        flame.scale.set(1 - n * 0.3, (gutter ? 0.85 : 1) + n);
        flame.skew.x = lean + leanNoise(timeMs) * amplitude * 0.4;
        halo.alpha = 0.8 + n;
        halo.scale.set(1 + n * 0.4);
      },
      resize: layout,
      update(next) {
        if (next.hour !== undefined && next.hour !== props.hour) {
          sweep = { from: shownHour, to: sweepTarget(shownHour, next.hour), startMs: null };
        }
        props = next;
      },
      destroy() {
        app.stage.removeChild(root);
        root.destroy({ children: true });
      },
    };
  },
};
