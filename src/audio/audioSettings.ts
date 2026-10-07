/**
 * The player's sound settings (#73): mute and a master volume, kept per
 * browser in localStorage. Storage can be missing or throw (private mode,
 * blocked site data), so every read and write falls back to the defaults.
 */

export interface AudioSettings {
  muted: boolean;
  /** Master volume, 0..1. */
  volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, volume: 0.7 };

export const AUDIO_SETTINGS_KEY = "caribbean.audio";

/** The part of `Storage` the settings use, so tests can pass a stand-in. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_AUDIO_SETTINGS.volume;
  return Math.min(1, Math.max(0, volume));
}

/** Settings from their saved JSON, each field defaulted when missing or invalid. */
export function parseAudioSettings(raw: string | null): AudioSettings {
  if (raw === null) return { ...DEFAULT_AUDIO_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_AUDIO_SETTINGS };
  const fields = parsed as Record<string, unknown>;
  return {
    muted: typeof fields.muted === "boolean" ? fields.muted : DEFAULT_AUDIO_SETTINGS.muted,
    volume: typeof fields.volume === "number" ? clampVolume(fields.volume) : DEFAULT_AUDIO_SETTINGS.volume,
  };
}

export function loadAudioSettings(storage: SettingsStorage | undefined): AudioSettings {
  try {
    return parseAudioSettings(storage?.getItem(AUDIO_SETTINGS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(storage: SettingsStorage | undefined, settings: AudioSettings): void {
  try {
    storage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not saved: the settings still hold for this page.
  }
}

/** The gain on everything the game plays. */
export function masterGain(settings: AudioSettings): number {
  return settings.muted ? 0 : settings.volume;
}
