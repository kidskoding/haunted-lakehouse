import { describe, expect, it } from "vitest";
import {
  ariaKeyShortcuts,
  detectPlatform,
  keyGlyph,
  shortcutSpoken,
  shortcutText,
} from "./shortcut";

describe("shortcutText", () => {
  it("runs macOS glyphs together", () => {
    expect(shortcutText(["Mod", "Shift", "Enter"], "mac")).toBe("⌘⇧↵");
  });

  it("spells keys out and joins them with + elsewhere", () => {
    expect(shortcutText(["Mod", "Shift", "Enter"], "other")).toBe("Ctrl+Shift+Enter");
  });

  it("upper-cases printable keys as a keycap prints them", () => {
    expect(shortcutText(["Mod", "n"], "other")).toBe("Ctrl+N");
    expect(keyGlyph("?", "mac")).toBe("?");
  });

  it("keeps unknown multi-character keys as written", () => {
    expect(keyGlyph("PageDown", "other")).toBe("PageDown");
  });

  it("does not treat Object.prototype names as named keys", () => {
    expect(keyGlyph("toString", "mac")).toBe("toString");
  });
});

describe("shortcutSpoken", () => {
  it("names each key in words for the platform", () => {
    expect(shortcutSpoken(["Mod", "Enter"], "mac")).toBe("Command Return");
    expect(shortcutSpoken(["Mod", "Alt", "f"], "other")).toBe("Control Alt F");
  });
});

describe("ariaKeyShortcuts", () => {
  it("maps Mod to the platform's modifier in the aria-keyshortcuts grammar", () => {
    expect(ariaKeyShortcuts(["Mod", "Shift", "Enter"], "mac")).toBe("Meta+Shift+Enter");
    expect(ariaKeyShortcuts(["Mod", "Enter"], "other")).toBe("Control+Enter");
    expect(ariaKeyShortcuts(["Escape"], "mac")).toBe("Escape");
  });
});

describe("detectPlatform", () => {
  it("recognises Apple platforms", () => {
    expect(detectPlatform("macOS")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("mac");
    expect(detectPlatform("iPad")).toBe("mac");
  });

  it("treats everything else as other", () => {
    expect(detectPlatform("Windows")).toBe("other");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
    expect(detectPlatform("")).toBe("other");
  });
});
