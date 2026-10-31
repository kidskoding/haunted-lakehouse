import type { CSSProperties } from "react";
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  dock,
  FRAME_TOP,
  frameCss,
  ghost,
  HOLLOW_REST,
  lakeBands,
  moon,
  moonPath,
  palette,
  pumpkin,
  reeds,
  reflectLight,
  reflectPolygon,
  ridgeShape,
  ripples,
  skyBands,
  stars,
  town,
  type Light,
  type Polygon,
} from "./hollow-creek-art";

function points(polygon: Polygon): string {
  return polygon.join(" ");
}

function bandRects(bands: readonly { top: number; color: string }[], bottom: number) {
  return bands.map((band, i) => {
    const next = bands[i + 1]?.top ?? bottom;
    return (
      <rect
        key={band.top}
        x="0"
        y={band.top}
        width={DESIGN_WIDTH}
        height={next - band.top}
        fill={band.color}
      />
    );
  });
}

const lightColor = { window: palette.window, porch: palette.porch, hollow: palette.hollow };

/* A plain function, not a component: ImageResponse only accepts intrinsic elements inside <svg>. */
function lightRect(light: Light, opacity: number, key: number) {
  return (
    <rect
      key={key}
      x={light.x}
      y={light.y}
      width={light.w}
      height={light.h}
      fill={lightColor[light.kind]}
      opacity={opacity}
    />
  );
}

const lights = town.flatMap((building) => building.lights);
const shapes = town.flatMap((building) => building.shapes);

/**
 * Hollow Creek at dusk as plain SVG, at rest: every light on, the water still. It is the
 * scene's stand-in while PixiJS loads, its no-WebGL fallback, and the Open Graph card's art.
 * It uses no hooks or ids, so it also renders inside `ImageResponse`.
 */
export function HollowCreekDrawing({ style }: Readonly<{ style?: CSSProperties }>) {
  return (
    <svg
      viewBox={frameCss.viewBox}
      width={DESIGN_WIDTH}
      height={DESIGN_HEIGHT - FRAME_TOP}
      overflow="visible"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {skyBands.map((band) => (
        <polygon key={band.color} points={points(band.points)} fill={band.color} />
      ))}
      {stars.map((star) => (
        <circle
          key={star.seed}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill={palette.star}
          opacity={0.75}
        />
      ))}
      <circle cx={moon.x} cy={moon.y} r={moon.r} fill={palette.moon} />
      <polygon points={points(ridgeShape)} fill={palette.ridge} />
      {bandRects(lakeBands, DESIGN_HEIGHT)}
      {moonPath.map((streak) => (
        <rect
          key={`${String(streak.x)}-${String(streak.y)}`}
          x={streak.x}
          y={streak.y}
          width={streak.w}
          height="2"
          fill={palette.moon}
          opacity={streak.alpha}
        />
      ))}
      <g opacity={0.55}>
        <polygon points={points(reflectPolygon(ridgeShape))} fill={palette.ridge} />
        {[...shapes, ...ghost.shapes].map((shape, i) => (
          <polygon key={i} points={points(reflectPolygon(shape))} fill={palette.foreground} />
        ))}
      </g>
      {lights.map((light, i) => lightRect(reflectLight(light), 0.4, i))}
      {ghost.lights.map((light, i) => lightRect(reflectLight(light), HOLLOW_REST, i))}
      {ripples.map((ripple, i) => (
        <rect
          key={i}
          x={ripple.x}
          y={ripple.y}
          width={ripple.length}
          height="1.5"
          fill={ripple.color}
        />
      ))}
      {shapes.map((shape, i) => (
        <polygon key={i} points={points(shape)} fill={palette.silhouette} />
      ))}
      {lights.map((light, i) => lightRect(light, 1, i))}
      {reeds.map((reed) => (
        <line
          key={reed.x}
          x1={reed.x}
          y1={DESIGN_HEIGHT}
          x2={reed.x + 4}
          y2={reed.top}
          stroke={palette.foreground}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {dock.map((plank, i) => (
        <polygon key={i} points={points(plank)} fill={palette.foreground} />
      ))}
      <ellipse
        cx={pumpkin.body.x}
        cy={pumpkin.body.y}
        rx={pumpkin.body.rx}
        ry={pumpkin.body.ry}
        fill={palette.foreground}
      />
      <polygon points={points(pumpkin.stem)} fill={palette.foreground} />
      {pumpkin.face.map((cut, i) => (
        <polygon key={i} points={points(cut)} fill={palette.window} />
      ))}
    </svg>
  );
}
