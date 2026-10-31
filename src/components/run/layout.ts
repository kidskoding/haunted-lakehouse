/*
 * The run screen's resizable layout as plain numbers. Every size is a percentage of the
 * region its splitter divides, so a layout saved on one window still fits another.
 */

/** The four panes a splitter sizes. The editor takes what the DAG and results leave. */
export type PaneId = "left" | "story" | "dag" | "results";

export interface RunLayoutSizes {
  /** The left column's share of the screen's width. */
  readonly left: number;
  /** The story's share of the left column; the table browser takes the rest. */
  readonly story: number;
  /** The DAG's share of the right column. */
  readonly dag: number;
  /** The results' share of the right column. */
  readonly results: number;
}

export interface Bounds {
  readonly min: number;
  readonly max: number;
}

export const PANE_LIMITS: Readonly<Record<PaneId, Bounds>> = {
  left: { min: 22, max: 50 },
  story: { min: 25, max: 80 },
  dag: { min: 14, max: 42 },
  results: { min: 16, max: 50 },
};

/** The editor is where the player works, so the DAG and results can never squeeze it below this. */
export const EDITOR_MIN = 34;

export const DEFAULT_LAYOUT: RunLayoutSizes = { left: 32, story: 55, dag: 24, results: 30 };

/** Versioned so a future change of shape can ignore old values instead of misreading them. */
export const LAYOUT_STORAGE_KEY = "haunted-lakehouse:run-layout:v1";

/** One arrow press, and one Shift+arrow press, in percentage points. */
export const STEP = 2;
export const BIG_STEP = 10;

function clamp(value: number, { min, max }: Bounds): number {
  return Math.min(max, Math.max(min, value));
}

/** Tenths of a point: finer than any pixel at desktop widths, and stable to store. */
function tidy(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The gutter between two panes, which is also their splitter. */
export const GUTTER_REM = 0.25;

/**
 * The fewest rems each grid track may shrink to, so every pane stays usable on a short window.
 * `right` is the right column and `tables` the table browser; the rest are the panes.
 */
export const TRACK_FLOOR_REM = {
  left: 18,
  right: 36,
  story: 8,
  tables: 8,
  dag: 6,
  editor: 12,
  results: 6,
} as const;

export type Track = keyof typeof TRACK_FLOOR_REM;

/** Each track's floor as a percentage of its region, once the region has been measured. */
export type TrackFloors = Readonly<Record<Track, number>>;

export const NO_FLOORS: TrackFloors = {
  left: 0,
  right: 0,
  story: 0,
  tables: 0,
  dag: 0,
  editor: 0,
  results: 0,
};

/** The measured regions the splitters divide, in CSS pixels. */
export interface RegionSizes {
  readonly width: number;
  readonly leftHeight: number;
  readonly rightHeight: number;
}

/**
 * Converts the rem floors into percentages of the measured regions, so the limits a splitter
 * offers are sizes the grid can really give. A share is of the region less its gutters, which
 * is what the grid's `fr` tracks divide. Rounded up, so a pane at its limit is never below its
 * floor. A region with no size (a hidden one) has no floors.
 */
export function trackFloors(regions: RegionSizes, remPx: number): TrackFloors {
  const share = (track: Track, length: number, gutters: number): number => {
    const space = length - gutters * GUTTER_REM * remPx;
    if (!(space > 0) || !(remPx > 0)) return 0;
    return Math.ceil(((TRACK_FLOOR_REM[track] * remPx) / space) * 1000) / 10;
  };
  return {
    left: share("left", regions.width, 1),
    right: share("right", regions.width, 1),
    story: share("story", regions.leftHeight, 1),
    tables: share("tables", regions.leftHeight, 1),
    dag: share("dag", regions.rightHeight, 2),
    editor: share("editor", regions.rightHeight, 2),
    results: share("results", regions.rightHeight, 2),
  };
}

/**
 * The range a pane may take given the others and the measured floors. The DAG and results
 * share the right column with the editor, so each one's ceiling drops as the other grows.
 */
export function paneBounds(
  sizes: RunLayoutSizes,
  pane: PaneId,
  floors: TrackFloors = NO_FLOORS,
): Bounds {
  const limits = PANE_LIMITS[pane];
  const editorMin = Math.max(EDITOR_MIN, floors.editor);
  switch (pane) {
    case "left":
      return {
        min: Math.max(limits.min, floors.left),
        max: Math.min(limits.max, 100 - floors.right),
      };
    case "story":
      return {
        min: Math.max(limits.min, floors.story),
        max: Math.min(limits.max, 100 - floors.tables),
      };
    case "dag":
      return {
        min: Math.max(limits.min, floors.dag),
        max: Math.min(limits.max, 100 - editorMin - sizes.results),
      };
    case "results":
      return {
        min: Math.max(limits.min, floors.results),
        max: Math.min(limits.max, 100 - editorMin - sizes.dag),
      };
  }
}

/** The editor's share of the right column. */
export function editorShare(sizes: RunLayoutSizes): number {
  return tidy(100 - sizes.dag - sizes.results);
}

/** Sets one pane, clamped to what the rest of the layout allows. Non-finite input is ignored. */
export function setPane(
  sizes: RunLayoutSizes,
  pane: PaneId,
  value: number,
  floors: TrackFloors = NO_FLOORS,
): RunLayoutSizes {
  if (!Number.isFinite(value)) return sizes;
  return { ...sizes, [pane]: tidy(clamp(value, paneBounds(sizes, pane, floors))) };
}

/**
 * Brings any combination of sizes into range. The DAG is settled first, leaving the results
 * room for their floor, and the results fit around it.
 */
export function clampLayout(
  sizes: RunLayoutSizes,
  floors: TrackFloors = NO_FLOORS,
): RunLayoutSizes {
  const left = tidy(clamp(sizes.left, paneBounds(sizes, "left", floors)));
  const story = tidy(clamp(sizes.story, paneBounds(sizes, "story", floors)));
  const resultsMin = paneBounds(sizes, "results", floors).min;
  const dag = tidy(clamp(sizes.dag, paneBounds({ ...sizes, results: resultsMin }, "dag", floors)));
  const results = tidy(clamp(sizes.results, paneBounds({ ...sizes, dag }, "results", floors)));
  return { left, story, dag, results };
}

/**
 * Reads a stored layout. Missing, unparsable, or hand-edited values fall back field by field
 * to the defaults, and whatever survives is clamped, so a bad value can never break the screen.
 */
export function parseLayout(raw: string | null): RunLayoutSizes {
  if (raw === null) return DEFAULT_LAYOUT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_LAYOUT;
  }
  const record = parsed as Record<string, unknown>;
  const field = (pane: PaneId): number => {
    const value = record[pane];
    return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_LAYOUT[pane];
  };
  return clampLayout({
    left: field("left"),
    story: field("story"),
    dag: field("dag"),
    results: field("results"),
  });
}

export function serializeLayout(sizes: RunLayoutSizes): string {
  return JSON.stringify({
    left: sizes.left,
    story: sizes.story,
    dag: sizes.dag,
    results: sizes.results,
  });
}

/** Whether a pane sits before its splitter (left of it, or above it) or after it. */
export type PaneSide = "before" | "after";

/** A separator's `aria-orientation`: a vertical one divides left from right. */
export type SplitterOrientation = "horizontal" | "vertical";

export type KeyAction =
  | { readonly kind: "step"; readonly delta: number }
  | { readonly kind: "min" }
  | { readonly kind: "max" }
  | { readonly kind: "reset" };

/**
 * What a key does to a splitter, following the WAI-ARIA window splitter pattern: the arrows
 * along its axis move it, Home and End give the pane its smallest and largest size, and Enter
 * restores the default. Moving toward the pane shrinks it, so the arrows always move the line
 * the way they point. Returns null for keys the splitter leaves alone.
 */
export function keyAction(
  key: string,
  shiftKey: boolean,
  orientation: SplitterOrientation,
  side: PaneSide,
): KeyAction | null {
  const step = shiftKey ? BIG_STEP : STEP;
  const [back, forward] =
    orientation === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  const grow = side === "before" ? step : -step;
  switch (key) {
    case back:
      return { kind: "step", delta: -grow };
    case forward:
      return { kind: "step", delta: grow };
    case "Home":
      return { kind: "min" };
    case "End":
      return { kind: "max" };
    case "Enter":
      return { kind: "reset" };
    default:
      return null;
  }
}

/**
 * Converts a pointer position into the pane's share of its region: the distance from the
 * region's start for a pane before the splitter, from its end for one after it.
 */
export function shareAt(position: number, start: number, length: number, side: PaneSide): number {
  if (!(length > 0)) return Number.NaN;
  const offset = side === "before" ? position - start : start + length - position;
  return (offset / length) * 100;
}
