import { useEffect, useState } from "react";
import { ambienceBed } from "../audio/sharedAmbienceBed";
import type { AmbienceLayer } from "../audio/ambienceBed";
import { AMBIENCE_CLOSE_DISTANCE, AMBIENCE_WIDE_DISTANCE } from "../audio/ambienceMix";
import { CAMERA_MAX_DISTANCE, CAMERA_MIN_DISTANCE } from "../board/cameraBounds";
import { SHIP_VIEW_DISTANCE } from "../board/shipView";
import { fromLogScale, toLogScale } from "./logScale";

/** Camera distances worth jumping to: the game's zoom stops. */
const PRESETS: readonly { label: string; distance: number }[] = [
  { label: "Town", distance: CAMERA_MIN_DISTANCE },
  { label: "Ship", distance: SHIP_VIEW_DISTANCE },
  { label: "Mid", distance: Math.sqrt(AMBIENCE_CLOSE_DISTANCE * AMBIENCE_WIDE_DISTANCE) },
  { label: "Map", distance: 24 },
];

const LAYER_LABELS: Record<AmbienceLayer, string> = { wide: "Wide sea", close: "Close water" };

/**
 * The ambience bed in the sound lab (#73): play it, slide the camera
 * distance from town zoom to map zoom and hear the crossfade, and tune each
 * layer's base volume. Starts stopped; nothing plays until Play.
 */
export function SoundLabAmbience({ masterGain }: { masterGain: number }) {
  const [playing, setPlaying] = useState(false);
  const [distance, setDistance] = useState(SHIP_VIEW_DISTANCE);
  const [, setBase] = useState(() => ambienceBed.levels().base);

  // The lab owns the bed while it is open: stopped until Play, stopped on leaving
  useEffect(() => {
    ambienceBed.setPaused(true);
    ambienceBed.setDistance(SHIP_VIEW_DISTANCE);
    return () => ambienceBed.setPaused(true);
  }, []);

  const changeDistance = (next: number) => {
    setDistance(next);
    ambienceBed.setDistance(next);
  };
  const play = () => {
    ambienceBed.setPaused(false);
    ambienceBed.setDistance(distance);
    setPlaying(ambienceBed.levels().playing);
  };
  const stop = () => {
    ambienceBed.setPaused(true);
    setPlaying(false);
  };
  const changeBase = (layer: AmbienceLayer, volume: number) => {
    ambienceBed.setBaseVolume(layer, volume);
    setBase(ambienceBed.levels().base);
  };

  const levels = ambienceBed.levels();

  return (
    <section className="mt-6 p-4 rounded-lg border border-amber-700/50 bg-stone-900/80">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={playing ? stop : play}
          className={`w-24 font-heading py-2 rounded-md text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors border ${
            playing
              ? "bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-400"
              : "bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border-amber-700/40"
          }`}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <div>
          <h2 className="text-amber-100 font-semibold">Ambience bed</h2>
          <p className="text-xs text-stone-400">
            Wide sea and close water, crossfading with camera distance as in the game (<code>src/audio/ambienceMix.ts</code>).
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-xs text-stone-300">
        <label className="flex flex-wrap items-center gap-2">
          Camera distance
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={toLogScale(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE)}
            onChange={(e) => changeDistance(fromLogScale(Number(e.target.value), CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE))}
            className="w-64 accent-amber-500 cursor-pointer"
            aria-label="Camera distance"
          />
          <span className="tabular-nums text-amber-200" data-testid="ambience-distance">
            {distance.toFixed(2)}
          </span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => changeDistance(preset.distance)}
              className="px-2 py-0.5 rounded border border-amber-700/40 text-amber-200 hover:bg-amber-800/60 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </label>

        {(["wide", "close"] as const).map((layer) => (
          <div key={layer} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="w-24 text-amber-100">{LAYER_LABELS[layer]}</span>
            <label className="flex items-center gap-2">
              Base volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={levels.base[layer]}
                onChange={(e) => changeBase(layer, Number(e.target.value))}
                className="w-28 accent-amber-500 cursor-pointer"
              />
              <span className="tabular-nums text-amber-200">{levels.base[layer].toFixed(2)}</span>
            </label>
            <span className="tabular-nums text-stone-400" data-testid={`ambience-${layer}`}>
              mix {levels.mix[layer].toFixed(2)} · gain {levels.gains[layer].toFixed(2)} · heard at{" "}
              {(levels.gains[layer] * masterGain).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
