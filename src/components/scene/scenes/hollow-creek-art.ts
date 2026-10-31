import { colors } from "@/lib/design/tokens";
import { createFlicker } from "../motion";

/*
 * Hollow Creek at dusk, as data. The PixiJS scene, its static SVG stand-in, and the Open
 * Graph card all draw from this one description, so the canvas takes over from the SVG
 * without a visible jump and the share card matches the page.
 *
 * The town sits on the far shore of the lake it is named for. Its reflection is drawn
 * squashed beneath the shoreline, and the reflection holds one house the shore does not:
 * the Hollow, showing only where the town keeps its history.
 */

/** The drawing is made in this fixed space, then scaled to its host. */
export const DESIGN_WIDTH = 1600;
export const DESIGN_HEIGHT = 600;
/** The far shoreline, where the town stands and its reflection begins. */
export const HORIZON = 372;
/** How much the lake squashes what it reflects. */
const REFLECT_SQUASH = 0.62;

/**
 * The drawing always spans at least this share of its host's height, so a tall phone screen
 * still gets a town rather than a sliver. Above the drawing the page's own night shows.
 */
export const MIN_HEIGHT_SHARE = 0.6;

export const palette = {
  silhouette: colors.inset,
  foreground: colors.void,
  ridge: colors.panel,
  moon: colors.parchment,
  star: colors.parchment,
  window: colors.flame,
  porch: colors.glow,
  hollow: colors.hollow,
} as const;

/**
 * The last of the light, in flat bands down to the shore: a screen print's steps, never a
 * blend. Each band's top edge wavers a little, like low cloud. Above them the sky is the
 * page's own night. Bands are listed top first; each runs down to the shore and the next
 * one covers its lower part.
 */
export const skyBands: readonly { readonly points: Polygon; readonly color: string }[] = [
  { top: 262, color: colors["tint-moon"] },
  { top: 290, color: colors.raised },
  { top: 316, color: colors.fog },
  { top: 340, color: colors["tint-flame"] },
].map(({ top, color }, band) => {
  const next = seeded(0xd05c + band);
  const edge: number[] = [];
  for (let x = 0; x <= DESIGN_WIDTH; x += 100) edge.push(x, top + (next() - 0.5) * 10);
  return { points: [...edge, DESIGN_WIDTH, HORIZON, 0, HORIZON], color };
});

/** The lake reflects the sky's lower bands in reverse, darkening towards the viewer. */
export const lakeBands: readonly { readonly top: number; readonly color: string }[] = [
  { top: HORIZON, color: colors.raised },
  { top: 410, color: colors["tint-moon"] },
  { top: 480, color: colors.panel },
  { top: 548, color: colors.night },
];

/**
 * The top of the sky is only the page's own night, so the drawing is framed from here down
 * when it is fitted. Anything above (the highest stars) still draws if the host has room.
 */
export const FRAME_TOP = 110;
const FRAME_HEIGHT = DESIGN_HEIGHT - FRAME_TOP;

/** Where the drawing sits inside a host of the given size: scaled to cover its width, anchored to the bottom. */
export function placeDrawing(
  width: number,
  height: number,
): { scale: number; x: number; y: number } {
  const scale = Math.max(width / DESIGN_WIDTH, (height * MIN_HEIGHT_SHARE) / FRAME_HEIGHT);
  return { scale, x: (width - DESIGN_WIDTH * scale) / 2, y: height - DESIGN_HEIGHT * scale };
}

/** The same placement as `placeDrawing`, as CSS for an SVG whose viewBox is the frame. */
export const frameCss = {
  width: `max(100cqw, ${String(((MIN_HEIGHT_SHARE * DESIGN_WIDTH) / FRAME_HEIGHT) * 100)}cqh)`,
  aspectRatio: `${String(DESIGN_WIDTH)} / ${String(FRAME_HEIGHT)}`,
  viewBox: `0 ${String(FRAME_TOP)} ${String(DESIGN_WIDTH)} ${String(FRAME_HEIGHT)}`,
} as const;

/** A closed polygon as flat `[x0, y0, x1, y1, …]` pairs. */
export type Polygon = readonly number[];

export type LightKind = "window" | "porch" | "hollow";

export interface Light {
  readonly kind: LightKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Restless lights switch off now and then: a porch light on a timer, a lamp carried room to room. */
  readonly restless: boolean;
  /** Seeds this light's flicker and timing. */
  readonly seed: number;
}

export interface Building {
  readonly shapes: readonly Polygon[];
  readonly lights: readonly Light[];
}

type Roof = "gable" | "saltbox" | "flat";

interface HouseSpec {
  readonly x: number;
  readonly w: number;
  readonly wall: number;
  readonly roof: number;
  readonly kind: Roof;
}

function houseOutline({ x, w, wall, roof, kind }: HouseSpec, base: number): Polygon {
  const eave = base - wall;
  if (kind === "flat") {
    return [x, base, x, eave, x + w, eave, x + w, base];
  }
  const peakX = kind === "gable" ? x + w / 2 : x + w * 0.34;
  return [
    x,
    base,
    x,
    eave,
    peakX,
    eave - roof,
    x + w,
    eave + (kind === "saltbox" ? 6 : 0),
    x + w,
    base,
  ];
}

/**
 * Windows on a regular grid, lit by a fixed pattern so every reload draws the same town.
 * The pattern leaves about one window in four dark.
 */
function houseWindows(spec: HouseSpec, base: number, houseIndex: number, size = 5): Light[] {
  const rows = spec.wall >= 34 ? 2 : 1;
  const cols = Math.max(1, Math.floor((spec.w - 8) / 15));
  const step = spec.w / (cols + 1);
  const lights: Light[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if ((index * 5 + houseIndex * 3) % 4 === 0) continue;
      lights.push({
        kind: "window",
        x: spec.x + step * (col + 1) - size / 2,
        y: base - spec.wall + 7 + row * (size + 10),
        w: size,
        h: size + 2,
        restless: (houseIndex + index) % 7 === 3,
        seed: houseIndex * 31 + index,
      });
    }
  }
  return lights;
}

function porchLight(spec: HouseSpec, base: number, houseIndex: number): Light {
  const x = spec.x + (houseIndex % 2 === 0 ? spec.w * 0.72 : spec.w * 0.28);
  return {
    kind: "porch",
    x: x - 1.5,
    y: base - 10,
    w: 3,
    h: 3,
    restless: houseIndex % 3 === 1,
    seed: 900 + houseIndex,
  };
}

const houses: readonly HouseSpec[] = [
  { x: 96, w: 46, wall: 24, roof: 16, kind: "gable" },
  { x: 150, w: 62, wall: 34, roof: 14, kind: "saltbox" },
  { x: 236, w: 40, wall: 22, roof: 18, kind: "gable" },
  { x: 300, w: 56, wall: 30, roof: 20, kind: "gable" },
  { x: 418, w: 52, wall: 28, roof: 18, kind: "gable" },
  { x: 478, w: 70, wall: 38, roof: 8, kind: "flat" },
  { x: 556, w: 44, wall: 26, roof: 20, kind: "gable" },
  { x: 822, w: 58, wall: 32, roof: 16, kind: "saltbox" },
  { x: 888, w: 40, wall: 24, roof: 16, kind: "gable" },
  { x: 1046, w: 66, wall: 36, roof: 18, kind: "gable" },
  { x: 1120, w: 48, wall: 26, roof: 8, kind: "flat" },
  { x: 1340, w: 44, wall: 24, roof: 16, kind: "saltbox" },
  { x: 1392, w: 60, wall: 34, roof: 18, kind: "gable" },
  { x: 1500, w: 42, wall: 22, roof: 14, kind: "gable" },
];

/**
 * The church: a nave with a tower and spire, the tallest thing in town. It stands right of
 * centre, so on the landing it never rises into the copy column.
 */
function church(base: number): Building {
  const nave: HouseSpec = { x: 1236, w: 64, wall: 34, roof: 24, kind: "gable" };
  const tower: Polygon = [1300, base, 1300, base - 72, 1320, base - 72, 1320, base];
  const spire: Polygon = [1298, base - 72, 1310, base - 132, 1322, base - 72];
  return {
    shapes: [houseOutline(nave, base), tower, spire],
    lights: [
      { kind: "window", x: 1307, y: base - 60, w: 6, h: 10, restless: false, seed: 700 },
      ...houseWindows(nave, base, 40, 6),
    ],
  };
}

/** The lakehouse itself: the biggest house in town, standing out over the water on stilts. */
function lakehouse(): Building {
  const floor = HORIZON + 6;
  const spec: HouseSpec = { x: 640, w: 150, wall: 58, roof: 44, kind: "gable" };
  const deck: Polygon = [624, floor, 812, floor, 812, floor + 4, 624, floor + 4];
  const stilts: Polygon[] = [632, 664, 700, 736, 772, 804].map((x) => [
    x,
    floor + 4,
    x + 3,
    floor + 4,
    x + 3,
    floor + 18,
    x,
    floor + 18,
  ]);
  const chimney: Polygon = [748, floor - 80, 748, floor - 98, 760, floor - 98, 760, floor - 70];
  const lights: Light[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (row === 1 && col === 2) continue;
      lights.push({
        kind: "window",
        x: 660 + col * 32,
        y: floor - 50 + row * 22,
        w: 9,
        h: 12,
        restless: row === 0 && col === 3,
        seed: 500 + row * 4 + col,
      });
    }
  }
  lights.push({ kind: "window", x: 709, y: floor - 84, w: 10, h: 10, restless: false, seed: 520 });
  lights.push({ kind: "porch", x: 790, y: floor - 12, w: 4, h: 4, restless: false, seed: 521 });
  return { shapes: [houseOutline(spec, floor), deck, ...stilts, chimney], lights };
}

function pine(x: number, height: number, base: number): Polygon {
  const half = height * 0.28;
  return [x - half, base, x, base - height, x + half, base];
}

const pines: Polygon[] = [
  [70, 30],
  [210, 44],
  [282, 36],
  [396, 28],
  [610, 40],
  [940, 46],
  [962, 34],
  [1180, 30],
  [1222, 42],
  [1460, 38],
  [1560, 50],
].map(([x = 0, height = 0]) => pine(x, height, HORIZON));

/** The ridge behind the town, as a jagged skyline from shore to shore. */
const ridge: Polygon = [
  0,
  HORIZON,
  0,
  334,
  120,
  326,
  260,
  338,
  420,
  318,
  560,
  330,
  700,
  312,
  860,
  328,
  1000,
  306,
  1160,
  324,
  1320,
  314,
  1460,
  332,
  1600,
  322,
  1600,
  HORIZON,
];

/** The shore strip the town stands on. */
const shore: Polygon = [
  0,
  HORIZON - 3,
  DESIGN_WIDTH,
  HORIZON - 3,
  DESIGN_WIDTH,
  HORIZON + 3,
  0,
  HORIZON + 3,
];

/** All that is left on the shore of the house the lake remembers: its foundation stones. */
const foundation: Polygon[] = [976, 994, 1012].map((x) => [
  x,
  HORIZON,
  x,
  HORIZON - 5,
  x + 14,
  HORIZON - 5,
  x + 14,
  HORIZON,
]);

/** Everything standing on the far shore, back to front. */
export const town: readonly Building[] = [
  { shapes: [shore, ...pines, ...foundation], lights: [] },
  church(HORIZON),
  ...houses.map((spec, index) => ({
    shapes: [houseOutline(spec, HORIZON)],
    lights: [...houseWindows(spec, HORIZON, index), porchLight(spec, HORIZON, index)],
  })),
  lakehouse(),
];

export const ridgeShape: Polygon = ridge;

export const moon = { x: 1000, y: 168, r: 30 } as const;

/**
 * The house that is only in the reflection. Its plot on the shore stands empty, under the
 * moon, so its reflection blocks part of the moon's path on the water.
 */
const ghostSpec: HouseSpec = { x: 972, w: 58, wall: 46, roof: 26, kind: "gable" };
export const ghost: Building = {
  shapes: [houseOutline(ghostSpec, HORIZON)],
  lights: [982, 1007].map((x, i) => ({
    kind: "hollow" as const,
    x,
    y: HORIZON - 40,
    w: 8,
    h: 10,
    restless: false,
    seed: 1300 + i,
  })),
};

/** Maps a shore-side y onto the water below the shoreline. */
export function reflectY(y: number): number {
  return HORIZON + (HORIZON - y) * REFLECT_SQUASH;
}

/** A polygon mirrored into the lake. */
export function reflectPolygon(points: Polygon): Polygon {
  return points.map((value, index) => (index % 2 === 0 ? value : reflectY(value)));
}

/** A light mirrored into the lake: a short streak, wider and thinner than its source. */
export function reflectLight(light: Light): Light {
  // The Hollow's windows keep their shape in the water: that is where it can be seen.
  const h = light.kind === "hollow" ? light.h * REFLECT_SQUASH : 2;
  return { ...light, x: light.x - 2, y: reflectY(light.y + light.h), w: light.w + 4, h };
}

/**
 * The moon's path on the water: streaks at uneven spacing that widen towards the viewer, some
 * broken in two, each with its own strength.
 */
export const moonPath: readonly { x: number; y: number; w: number; alpha: number }[] = (() => {
  const next = seeded(0x300e);
  const streaks: { x: number; y: number; w: number; alpha: number }[] = [];
  for (let y = HORIZON + 12, i = 0; y < DESIGN_HEIGHT - 50; y += 12 + next() * 10, i += 1) {
    const w = 10 + i * 5 + next() * 14;
    const x = moon.x - w / 2 + (next() - 0.5) * 10;
    const alpha = 0.2 + next() * 0.2;
    if (w > 30 && next() < 0.4) {
      const gap = 4 + next() * 6;
      const left = (w - gap) * (0.3 + next() * 0.4);
      streaks.push({ x, y, w: left, alpha }, { x: x + left + gap, y, w: w - left - gap, alpha });
    } else {
      streaks.push({ x, y, w, alpha });
    }
  }
  return streaks;
})();

/** A tiny seeded generator, so stars and ripples sit in the same place on every render. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly seed: number;
}

/** A few early stars, kept to the right of the sky so none sits behind the title. */
export const stars: readonly Star[] = (() => {
  const next = seeded(0x5a7);
  return Array.from({ length: 16 }, (_, seed) => ({
    x: 880 + next() * 700,
    y: FRAME_TOP + next() * 130,
    r: 1 + next() * 0.8,
    seed,
  })).filter((star) => Math.hypot(star.x - moon.x, star.y - moon.y) > moon.r + 18);
})();

export interface Ripple {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly color: string;
  /** Radians per second of the slow sideways drift. */
  readonly speed: number;
  readonly phase: number;
}

/** Thin lines of moving water in the lake's colors, breaking the reflections into strips. */
export const ripples: readonly Ripple[] = (() => {
  const next = seeded(0x1a4e);
  return Array.from({ length: 30 }, () => {
    const y = HORIZON + 8 + next() * (DESIGN_HEIGHT - HORIZON - 70);
    return {
      x: next() * DESIGN_WIDTH,
      y,
      length: 50 + next() * 160,
      color: y < 410 ? colors.fog : y < 480 ? colors.raised : colors["tint-moon"],
      speed: 0.25 + next() * 0.35,
      phase: next() * Math.PI * 2,
    };
  });
})();

/** How far a ripple has drifted at a moment of scene time. Still water holds it at rest. */
export function rippleOffset(ripple: Ripple, timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.sin((timeMs / 1000) * ripple.speed + ripple.phase) * 18;
}

/** The dock in the foreground, with a carved pumpkin keeping watch at its end. */
export const dock: readonly Polygon[] = [
  [0, 544, 300, 544, 304, 554, 0, 554],
  ...[36, 148, 264].map((x) => [x, 554, x + 9, 554, x + 9, DESIGN_HEIGHT, x, DESIGN_HEIGHT]),
];

export const pumpkin = {
  body: { x: 246, y: 530, rx: 22, ry: 15 },
  stem: [244, 516, 244, 508, 250, 506, 250, 516] as Polygon,
  face: [
    [234, 527, 240, 520, 243, 528],
    [249, 528, 252, 520, 258, 527],
    [233, 533, 238, 536, 243, 533, 248, 537, 253, 533, 259, 534, 254, 540, 238, 540],
  ] as readonly Polygon[],
} as const;

/** Reeds at the near shore, bottom right. */
export const reeds: readonly { x: number; top: number }[] = [
  { x: 1470, top: 548 },
  { x: 1488, top: 528 },
  { x: 1502, top: 556 },
  { x: 1526, top: 520 },
  { x: 1548, top: 540 },
  { x: 1572, top: 512 },
  { x: 1590, top: 544 },
];

/** How bright a light is at a moment of scene time, from 0 (off) to 1. */
export function lightLevel(light: Light, timeMs: number, reducedMotion: boolean): number {
  if (light.kind === "hollow") {
    if (reducedMotion) return HOLLOW_REST;
    // A slow breath, not a flicker: the Hollow is a presence, not a flame.
    return HOLLOW_REST + Math.sin((timeMs / 1000) * 0.9 + light.seed) * 0.22;
  }
  if (reducedMotion) return 1;
  if (light.restless && isOff(light, timeMs)) return 0;
  return 0.9 + flickerFor(light.seed)(timeMs) * 0.1;
}

/** The Hollow's window at rest: dim enough to miss on a first look. */
export const HOLLOW_REST = 0.65;

const flickers = new Map<number, (timeMs: number) => number>();
function flickerFor(seed: number): (timeMs: number) => number {
  let flicker = flickers.get(seed);
  if (!flicker) {
    flicker = createFlicker(seed, 3);
    flickers.set(seed, flicker);
  }
  return flicker;
}

/**
 * Restless lights go dark for a moment once per cycle. Each has its own cycle and offset, so
 * the town never blinks in unison.
 */
function isOff(light: Light, timeMs: number): boolean {
  const period = 7000 + (light.seed % 5) * 1900;
  const offAt = 2500 + ((light.seed * 1337) % 3000);
  const within = (timeMs + light.seed * 211) % period;
  return within >= offAt && within < offAt + 900;
}

/** Star brightness: a slow twinkle, held steady under reduced motion. */
export function starLevel(star: Star, timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.75;
  return 0.75 + flickerFor(2000 + star.seed)(timeMs / 6) * 0.25;
}
