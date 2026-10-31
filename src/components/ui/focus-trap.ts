/*
 * Keeps Tab inside a modal. `showModal()` makes the page behind a dialog inert, but Tab from
 * the last control still leaves for the browser's own toolbar; WAI-ARIA APG's dialog pattern
 * wraps it back to the first control instead (and Shift+Tab from the first to the last).
 */

/** Matches what browsers put in the Tab sequence inside a dialog, including editing hosts. */
export const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable]:not([contenteditable='false'])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Whether the element is in the browser Tab sequence for visibility. Matches
 * `checkVisibility({ visibilityProperty: true })`: `visibility: hidden` is omitted, while
 * default `checkVisibility()` would still count it.
 */
export function isTabVisible(element: {
  checkVisibility: (options?: { visibilityProperty?: boolean }) => boolean;
}): boolean {
  return element.checkVisibility({ visibilityProperty: true });
}

/**
 * Browser Tab order: positive `tabIndex` values ascending first, then `0` / default in
 * document order. `querySelectorAll` already yields document order; this only lifts positives.
 */
export function byTabOrder(a: { tabIndex: number }, b: { tabIndex: number }): number {
  const aRank = a.tabIndex > 0 ? a.tabIndex : Number.POSITIVE_INFINITY;
  const bRank = b.tabIndex > 0 ? b.tabIndex : Number.POSITIVE_INFINITY;
  return aRank - bRank;
}

/**
 * True when the control is disabled for Tab. `:disabled` already covers form controls inside
 * `fieldset[disabled]`; non-form `tabIndex` hosts in such a fieldset stay tabbable per HTML.
 */
export function isDisabledForTab(element: { matches: (selectors: string) => boolean }): boolean {
  return element.matches(":disabled");
}

/** The elements inside `root` that Tab can reach, in browser Tab order. */
export function tabbableIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.closest("[inert]") &&
        !isDisabledForTab(element) &&
        isTabVisible(element),
    )
    .sort(byTabOrder);
}

/**
 * Where Tab should land when it would otherwise leave the trap, or `undefined` to let the
 * browser move focus normally. `current` is the focused element's index among `count`
 * tabbable elements, or -1 when focus is on the container itself.
 */
export function wrappedTabIndex(
  current: number,
  count: number,
  backward: boolean,
): number | undefined {
  if (count === 0) return undefined;
  if (current === -1) return backward ? count - 1 : 0;
  if (backward && current === 0) return count - 1;
  if (!backward && current === count - 1) return 0;
  return undefined;
}

/** What a radio's Tab stop depends on: its group (`name` within one form owner) and state. */
export interface RadioState {
  readonly name: string;
  readonly checked: boolean;
  readonly form: object | null;
}

/**
 * Maps each element to the Tab stop that stands for it. A same-name radio group is one stop:
 * its checked radio, or its first radio when none is checked. Anything else, including an
 * unnamed radio, is its own stop.
 */
function stopsFor<T>(
  elements: readonly T[],
  radioOf: (element: T) => RadioState | undefined,
): Map<T, T> {
  const groups = new Map<object | null, Map<string, T>>();
  for (const element of elements) {
    const radio = radioOf(element);
    if (!radio || radio.name === "") continue;
    const byName = groups.get(radio.form) ?? new Map<string, T>();
    groups.set(radio.form, byName);
    const stop = byName.get(radio.name);
    if (stop === undefined || (radio.checked && !radioOf(stop)?.checked)) {
      byName.set(radio.name, element);
    }
  }
  return new Map(
    elements.map((element) => {
      const radio = radioOf(element);
      const stop = radio ? groups.get(radio.form)?.get(radio.name) : undefined;
      return [element, stop ?? element];
    }),
  );
}

/**
 * The element Tab should move focus to when it would leave the trap, or `undefined` to let
 * the browser move it. `elements` are the tabbable elements in document order; `radioOf`
 * says which of them are radios.
 */
export function wrapTarget<T>(
  elements: readonly T[],
  active: unknown,
  backward: boolean,
  radioOf: (element: T) => RadioState | undefined,
): T | undefined {
  const stopOf = stopsFor(elements, radioOf);
  const stops = elements.filter((element) => stopOf.get(element) === element);
  const focused = elements.find((element) => element === active);
  const current = focused === undefined ? -1 : stops.indexOf(stopOf.get(focused) ?? focused);
  const next = wrappedTabIndex(current, stops.length, backward);
  return next === undefined ? undefined : stops[next];
}

/** Reads a tabbable element as a radio, for `wrapTarget`. */
export function radioOf(element: HTMLElement): RadioState | undefined {
  return element instanceof HTMLInputElement && element.type === "radio" ? element : undefined;
}
