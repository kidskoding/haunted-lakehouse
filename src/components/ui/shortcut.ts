/*
 * Platform-aware keyboard shortcut text. Shortcuts are written once with `Mod` for the
 * platform's command key, then shown as macOS glyphs (⌘⇧↵) or spelled out (Ctrl+Shift+Enter),
 * spoken in words, and exposed to assistive technology through `aria-keyshortcuts`.
 */

export type Platform = "mac" | "other";

/** Keys with a special rendering. Anything else is a printable key shown as written. */
export type NamedKey =
  | "Mod"
  | "Shift"
  | "Alt"
  | "Enter"
  | "Escape"
  | "Tab"
  | "Backspace"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight";

interface KeyText {
  readonly mac: string;
  readonly other: string;
  readonly spokenMac: string;
  readonly spokenOther: string;
  /** The key's name in the `aria-keyshortcuts` grammar (UI Events `key` values). */
  readonly aria: (platform: Platform) => string;
}

const same = (aria: string) => () => aria;

const namedKeys: Readonly<Record<NamedKey, KeyText>> = {
  Mod: {
    mac: "⌘",
    other: "Ctrl",
    spokenMac: "Command",
    spokenOther: "Control",
    aria: (platform) => (platform === "mac" ? "Meta" : "Control"),
  },
  Shift: {
    mac: "⇧",
    other: "Shift",
    spokenMac: "Shift",
    spokenOther: "Shift",
    aria: same("Shift"),
  },
  Alt: { mac: "⌥", other: "Alt", spokenMac: "Option", spokenOther: "Alt", aria: same("Alt") },
  Enter: {
    mac: "↵",
    other: "Enter",
    spokenMac: "Return",
    spokenOther: "Enter",
    aria: same("Enter"),
  },
  Escape: {
    mac: "⎋",
    other: "Esc",
    spokenMac: "Escape",
    spokenOther: "Escape",
    aria: same("Escape"),
  },
  Tab: { mac: "⇥", other: "Tab", spokenMac: "Tab", spokenOther: "Tab", aria: same("Tab") },
  Backspace: {
    mac: "⌫",
    other: "Backspace",
    spokenMac: "Delete",
    spokenOther: "Backspace",
    aria: same("Backspace"),
  },
  ArrowUp: { mac: "↑", other: "↑", spokenMac: "Up", spokenOther: "Up", aria: same("ArrowUp") },
  ArrowDown: {
    mac: "↓",
    other: "↓",
    spokenMac: "Down",
    spokenOther: "Down",
    aria: same("ArrowDown"),
  },
  ArrowLeft: {
    mac: "←",
    other: "←",
    spokenMac: "Left",
    spokenOther: "Left",
    aria: same("ArrowLeft"),
  },
  ArrowRight: {
    mac: "→",
    other: "→",
    spokenMac: "Right",
    spokenOther: "Right",
    aria: same("ArrowRight"),
  },
};

function named(key: string): KeyText | undefined {
  return Object.hasOwn(namedKeys, key) ? namedKeys[key as NamedKey] : undefined;
}

/** A printable key is shown upper-case, as it is printed on the keycap. */
function printable(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/** One key as shown on screen. */
export function keyGlyph(key: string, platform: Platform): string {
  const text = named(key);
  if (!text) return printable(key);
  return platform === "mac" ? text.mac : text.other;
}

/**
 * The whole shortcut as shown on screen. macOS runs the glyphs together (⌘⇧↵); elsewhere the
 * keys are joined with `+` (Ctrl+Shift+Enter), following each platform's own menus.
 */
export function shortcutText(keys: readonly string[], platform: Platform): string {
  return keys.map((key) => keyGlyph(key, platform)).join(platform === "mac" ? "" : "+");
}

/** The shortcut in words, for screen readers: "Command Return", "Control Shift Enter". */
export function shortcutSpoken(keys: readonly string[], platform: Platform): string {
  return keys
    .map((key) => {
      const text = named(key);
      if (!text) return printable(key);
      return platform === "mac" ? text.spokenMac : text.spokenOther;
    })
    .join(" ");
}

/** The value for an `aria-keyshortcuts` attribute: "Meta+Enter", "Control+Shift+F". */
export function ariaKeyShortcuts(keys: readonly string[], platform: Platform): string {
  return keys.map((key) => named(key)?.aria(platform) ?? printable(key)).join("+");
}

/** Reads the platform from what the browser reports. iPadOS reports itself as a Mac. */
export function detectPlatform(reported: string): Platform {
  return /mac|iphone|ipad|ipod/i.test(reported) ? "mac" : "other";
}
