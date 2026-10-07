import { describe, it, expect } from "vitest";
import {
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_SETTINGS,
  clampVolume,
  loadAudioSettings,
  masterGain,
  parseAudioSettings,
  saveAudioSettings,
} from "./audioSettings";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
};

describe("clampVolume", () => {
  it("keeps a volume within 0..1", () => {
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(3)).toBe(1);
  });

  it("falls back to the default for a non-finite volume", () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_AUDIO_SETTINGS.volume);
  });
});

describe("parseAudioSettings", () => {
  it("reads what was saved", () => {
    expect(parseAudioSettings('{"muted":true,"volume":0.3}')).toEqual({ muted: true, volume: 0.3 });
  });

  it("defaults anything missing, malformed or of the wrong type", () => {
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings("not json")).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings("[]")).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings("null")).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('{"muted":"yes","volume":"loud"}')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings('{"muted":true}')).toEqual({ ...DEFAULT_AUDIO_SETTINGS, muted: true });
  });

  it("clamps a saved volume", () => {
    expect(parseAudioSettings('{"muted":false,"volume":7}')).toEqual({ muted: false, volume: 1 });
  });
});

describe("load and save", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    saveAudioSettings(storage, { muted: true, volume: 0.25 });
    expect(JSON.parse(storage.data[AUDIO_SETTINGS_KEY])).toEqual({ muted: true, volume: 0.25 });
    expect(loadAudioSettings(storage)).toEqual({ muted: true, volume: 0.25 });
  });

  it("defaults without storage or when storage throws", () => {
    expect(loadAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(throwingStorage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(() => saveAudioSettings(throwingStorage, DEFAULT_AUDIO_SETTINGS)).not.toThrow();
    expect(() => saveAudioSettings(undefined, DEFAULT_AUDIO_SETTINGS)).not.toThrow();
  });
});

describe("masterGain", () => {
  it("is the volume, or silence when muted", () => {
    expect(masterGain({ muted: false, volume: 0.6 })).toBe(0.6);
    expect(masterGain({ muted: true, volume: 0.6 })).toBe(0);
  });
});
