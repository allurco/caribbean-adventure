import { useEffect, useMemo, useState } from "react";
import type { MapRequest } from "../game/mapRequest";
import { ignoredUnderGate } from "../landscape/rotateGatePresence";
import { pinnedMapUrl, seedStepForKey, steppedSeedUrl, type SeedStep } from "./seedStepUrl";

/** Seed picking (ADR 0007): the random step draws a new world's seed, like `loadGameClient`. */
function reloadOn(map: MapRequest, step: SeedStep) {
  // eslint-disable-next-line no-restricted-properties -- a seed-picking call site: the dev control's random seed
  window.location.assign(steppedSeedUrl(window.location.href, map, step, Math.random));
}

/**
 * Dev seed control (#161): the map's seed and size, a button copying a URL
 * that reproduces it, and `[` / `]` / `\` (or the buttons) reloading on
 * seed − 1, seed + 1 or a random seed with the same size and camera. The
 * board mounts it in dev builds only.
 */
export function DevSeedControl({ mapSize, mapSeed }: MapRequest) {
  const map = useMemo<MapRequest>(() => ({ mapSize, mapSeed }), [mapSize, mapSeed]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = ignoredUnderGate((event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const step = seedStepForKey(event.key);
      if (step) reloadOn(map, step);
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  const copy = () => {
    navigator.clipboard.writeText(pinnedMapUrl(window.location.href, map)).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => setCopied(false),
    );
  };

  const button = "px-1.5 rounded bg-white/15 hover:bg-white/30 cursor-pointer";
  return (
    <div
      data-testid="dev-seed-control"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 text-white font-mono text-xs"
    >
      <span>
        {map.mapSize} · seed {map.mapSeed}
      </span>
      <button type="button" className={button} title="Seed − 1 (key [)" onClick={() => reloadOn(map, "prev")}>
        [
      </button>
      <button type="button" className={button} title="Seed + 1 (key ])" onClick={() => reloadOn(map, "next")}>
        ]
      </button>
      <button type="button" className={button} title="Random seed (key \)" onClick={() => reloadOn(map, "random")}>
        \ random
      </button>
      <button type="button" className={button} title="Copy a URL that reproduces this map and view" onClick={copy}>
        {copied ? "copied" : "copy URL"}
      </button>
    </div>
  );
}
