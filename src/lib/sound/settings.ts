/** The player's sound preferences. */
export interface SoundSettings {
  readonly muted: boolean;
  /** Slider position in [0, 1]; `volumeToGain` turns it into loudness. */
  readonly volume: number;
}

/** The subset of `Storage` the settings need, so tests can hand in a fake. */
export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

export const SETTINGS_KEY = "haunted-lakehouse:sound";

/** Sound is off until the player asks for it. */
export const DEFAULT_SETTINGS: SoundSettings = { muted: true, volume: 0.6 };

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_SETTINGS.volume;
  return Math.min(1, Math.max(0, volume));
}

/**
 * Reads saved settings. Private windows, blocked storage, and hand-edited values all fall
 * back to the defaults rather than failing.
 */
export function loadSettings(storage: SettingsStorage | null): SoundSettings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const { muted, volume } = parsed as Record<string, unknown>;
    return {
      muted: typeof muted === "boolean" ? muted : DEFAULT_SETTINGS.muted,
      volume: typeof volume === "number" ? clampVolume(volume) : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Saves settings. A full or blocked storage only costs persistence, never the session. */
export function saveSettings(storage: SettingsStorage | null, settings: SoundSettings): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this visit; they just will not be remembered.
  }
}

/**
 * Maps the slider to gain on a squared curve: loudness is roughly logarithmic, so a linear
 * slider would do all its work in the bottom fifth.
 */
export function volumeToGain(volume: number): number {
  const v = clampVolume(volume);
  return v * v;
}
