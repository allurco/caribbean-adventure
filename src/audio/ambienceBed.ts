import type { AudioEngine, SoundHandle } from "./audioEngine";
import { type AmbienceMix, ambienceMix } from "./ambienceMix";
import { type SoundId, soundById } from "./soundRegistry";

/**
 * The open-sea ambience bed (#73): the wide-sea and close-water loops,
 * crossfaded by camera distance (`ambienceMix`). The board feeds it the
 * camera's distance every frame; the loops start on the first frame after
 * the first click unlocks audio, so nothing plays before it. The player's
 * mute and master volume apply through the engine's listener.
 */
export type AmbienceLayer = keyof AmbienceMix;

const LAYER_SOUNDS: Record<AmbienceLayer, SoundId> = { wide: "sea-wide", close: "sea-close" };
const LAYERS: readonly AmbienceLayer[] = ["wide", "close"];

/** What the bed is doing, for the sound lab and for checks in a browser. */
export interface AmbienceLevels {
  playing: boolean;
  /** Camera distance last given, or null before the first frame. */
  distance: number | null;
  /** Per-layer crossfade gains for that distance. */
  mix: AmbienceMix;
  /** Per-layer base volumes (the registry's, unless the lab changed them). */
  base: AmbienceMix;
  /** Gains set on the layers: mix × base, before the master volume. */
  gains: AmbienceMix;
}

export interface AmbienceBed {
  /** The camera's distance from its focus; starts the loops once audio is unlocked. Call every frame. */
  setDistance(distance: number): void;
  /** A layer's base volume, 0..1 (the lab tunes these by ear). */
  setBaseVolume(layer: AmbienceLayer, volume: number): void;
  /** Hold the bed silent (stopped) until unpaused. */
  setPaused(paused: boolean): void;
  /** Stop both loops; the next `setDistance` starts them again unless paused. */
  stop(): void;
  levels(): AmbienceLevels;
}

/** Below this a gain change is not worth an automation event. */
const GAIN_EPSILON = 1e-4;

export function createAmbienceBed(engine: Pick<AudioEngine, "play">): AmbienceBed {
  let handles: Record<AmbienceLayer, SoundHandle> | null = null;
  let distance: number | null = null;
  let paused = false;
  let mix: AmbienceMix = ambienceMix(0);
  const base: AmbienceMix = { wide: soundById("sea-wide").volume, close: soundById("sea-close").volume };
  const applied: AmbienceMix = { wide: Number.NaN, close: Number.NaN };

  const gain = (layer: AmbienceLayer) => mix[layer] * base[layer];

  const start = () => {
    const wide = engine.play(LAYER_SOUNDS.wide, { loop: true, volume: gain("wide") });
    if (!wide) return; // Still locked: try again next frame
    const close = engine.play(LAYER_SOUNDS.close, { loop: true, volume: gain("close") });
    if (!close) {
      wide.stop();
      return;
    }
    handles = { wide, close };
    for (const layer of LAYERS) applied[layer] = gain(layer);
  };

  const apply = () => {
    if (!handles) return;
    for (const layer of LAYERS) {
      const next = gain(layer);
      if (Math.abs(next - applied[layer]) < GAIN_EPSILON) continue;
      handles[layer].setVolume(next);
      applied[layer] = next;
    }
  };

  const stop = () => {
    if (!handles) return;
    for (const layer of LAYERS) handles[layer].stop();
    handles = null;
  };

  return {
    setDistance(next) {
      distance = next;
      mix = ambienceMix(next);
      if (paused) return;
      if (handles) apply();
      else start();
    },

    setBaseVolume(layer, volume) {
      base[layer] = volume;
      apply();
    },

    setPaused(next) {
      paused = next;
      if (paused) stop();
    },

    stop,

    levels: () => ({
      playing: handles !== null,
      distance,
      mix: { ...mix },
      base: { ...base },
      gains: { wide: gain("wide"), close: gain("close") },
    }),
  };
}
