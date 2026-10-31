"use client";

import { useSyncExternalStore, type ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { detectPlatform, shortcutSpoken, shortcutText, type Platform } from "./shortcut";

/*
 * Keycaps take their ink from two custom properties so the surface they sit on can restyle
 * them without a prop: filled buttons set both to `night` (art direction §5.6).
 */
const keycap =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border px-1 type-data-s " +
  "border-(--kbd-line,var(--color-line-control)) text-(--kbd-ink,var(--color-ash))";

/** One keycap, for prose such as "press <Kbd>?</Kbd> for every shortcut". */
export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return <kbd className={cx(keycap, className)} {...props} />;
}

const noSubscription = () => () => undefined;

function readPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return detectPlatform(nav.userAgentData?.platform ?? nav.userAgent);
}

/**
 * The player's platform. The server cannot know it, so the first render says "other" and
 * hydration corrects it on a Mac.
 */
export function usePlatform(): Platform {
  return useSyncExternalStore(noSubscription, readPlatform, () => "other");
}

export interface ShortcutProps extends Omit<ComponentPropsWithoutRef<"kbd">, "children"> {
  /** Keys in order, with `Mod` for the platform's command key: `["Mod", "Enter"]`. */
  readonly keys: readonly string[];
  /** Pins the platform, for specimens; otherwise it follows the player's machine. */
  readonly platform?: Platform;
}

/**
 * A key combination as one keycap: ⌘↵ on macOS, Ctrl+Enter elsewhere, with the spoken form
 * for screen readers. Inside a control that announces the shortcut through
 * `aria-keyshortcuts`, pass `aria-hidden` so it is not read twice.
 */
export function Shortcut({ keys, platform, className, ...props }: ShortcutProps) {
  const detected = usePlatform();
  const resolved = platform ?? detected;
  return (
    <kbd className={cx(keycap, className)} {...props}>
      <span aria-hidden="true">{shortcutText(keys, resolved)}</span>
      <span className="sr-only">{shortcutSpoken(keys, resolved)}</span>
    </kbd>
  );
}
