/*
 * Keeps Tab inside a modal. `showModal()` makes the page behind a dialog inert, but Tab from
 * the last control still leaves for the browser's own toolbar; WAI-ARIA APG's dialog pattern
 * wraps it back to the first control instead (and Shift+Tab from the first to the last).
 */

const tabbableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** The elements inside `root` that Tab can reach, in document order. */
export function tabbableIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(tabbableSelector)).filter(
    (element) => element.tabIndex >= 0 && !element.closest("[inert]") && element.checkVisibility(),
  );
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
