/** A visible row of a tree, in display order. */
export interface TreeRow {
  readonly key: string;
  /** The row's parent, or `null` at the top level. */
  readonly parent: string | null;
  /** Whether the row has children; `expanded` says whether they show. */
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/** What a key press asks the tree to do. */
export type TreeAction =
  | { readonly type: "focus"; readonly key: string }
  | { readonly type: "expand"; readonly key: string; readonly expanded: boolean }
  | { readonly type: "activate"; readonly key: string };

/**
 * The WAI-ARIA APG tree keyboard model over the visible rows: Up and Down step, Home and End
 * jump, Right expands a closed row or enters an open one, Left closes an open row or climbs to
 * the parent, Enter and Space activate. Returns `undefined` for keys the tree leaves alone.
 */
export function treeAction(
  rows: readonly TreeRow[],
  current: string,
  key: string,
): TreeAction | undefined {
  const index = rows.findIndex((row) => row.key === current);
  const row = rows[index];
  if (row === undefined) return undefined;
  const focus = (target: TreeRow | undefined): TreeAction | undefined =>
    target === undefined ? undefined : { type: "focus", key: target.key };

  switch (key) {
    case "ArrowDown":
      return focus(rows[index + 1]);
    case "ArrowUp":
      return focus(rows[index - 1]);
    case "Home":
      return focus(rows[0]);
    case "End":
      return focus(rows[rows.length - 1]);
    case "ArrowRight": {
      if (!row.expandable) return undefined;
      if (!row.expanded) return { type: "expand", key: row.key, expanded: true };
      const child = rows[index + 1];
      return child?.parent === row.key ? focus(child) : undefined;
    }
    case "ArrowLeft": {
      if (row.expandable && row.expanded) return { type: "expand", key: row.key, expanded: false };
      return focus(rows.find((candidate) => candidate.key === row.parent));
    }
    case "Enter":
    case " ":
      return { type: "activate", key: row.key };
    default:
      return undefined;
  }
}
