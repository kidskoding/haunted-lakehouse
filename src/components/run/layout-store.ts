"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  parseLayout,
  serializeLayout,
  type RunLayoutSizes,
} from "./layout";

/*
 * The saved layout, shared by every run screen in the tab. The value lives in memory and is
 * mirrored to localStorage, so resizing still works for this visit when storage is blocked.
 */

let current: RunLayoutSizes | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored(): RunLayoutSizes {
  try {
    return parseLayout(storage()?.getItem(LAYOUT_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function snapshot(): RunLayoutSizes {
  current ??= readStored();
  return current;
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  // Another tab resized its run screen: follow it, as the player would expect on return.
  if (event.key !== LAYOUT_STORAGE_KEY && event.key !== null) return;
  current = readStored();
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function save(sizes: RunLayoutSizes) {
  current = sizes;
  try {
    storage()?.setItem(LAYOUT_STORAGE_KEY, serializeLayout(sizes));
  } catch {
    // A full or blocked storage only costs remembering the layout, never the resize.
  }
  notify();
}

/** The store behind {@link useSavedLayout}, exposed so it can be tested without a renderer. */
export const layoutStore = { subscribe, snapshot, save } as const;

/**
 * The player's saved run-screen layout and a setter that remembers it. The server and the
 * hydrating client both render the defaults, so markup always matches; the saved sizes
 * apply in the render straight after.
 */
export function useSavedLayout(): readonly [RunLayoutSizes, (sizes: RunLayoutSizes) => void] {
  const sizes = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_LAYOUT);
  return [sizes, save];
}
