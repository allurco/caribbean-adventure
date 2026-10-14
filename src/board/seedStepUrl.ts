import type { MapRequest } from "../game/mapRequest";

/**
 * The dev seed control (#161): what its keys and buttons do, as pure URL
 * building, so the control itself only reads the URL and reloads.
 */

/** Where a seed step goes: one seed down, one up, or a random seed. */
export type SeedStep = "prev" | "next" | "random";

const INT32_SPAN = 2 ** 32;

/** `seed` one down or up, wrapping round int32 so every step is a valid map seed. */
export function stepSeed(seed: number, step: "prev" | "next"): number {
  return (seed + (step === "next" ? 1 : -1)) | 0;
}

/** A map seed anywhere in int32, from `random` in [0, 1) (`Math.random` at the seed-picking call site). */
export function randomMapSeed(random: () => number): number {
  return Math.floor(random() * INT32_SPAN) - INT32_SPAN / 2;
}

const KEY_STEPS: Readonly<Record<string, SeedStep>> = { "[": "prev", "]": "next", "\\": "random" };

/** The step a key asks for: `[` prev, `]` next, `\` random; null for any other key. */
export function seedStepForKey(key: string): SeedStep | null {
  return KEY_STEPS[key] ?? null;
}

/**
 * `href` with the map's size and seed pinned (`size=`, `seed=`) and every
 * other parameter (the camera's `cx`, `cz`, `dist`, `stats`, …) and the hash
 * kept: a URL that reproduces the map on screen.
 */
export function pinnedMapUrl(href: string, map: MapRequest): string {
  const url = new URL(href);
  url.searchParams.set("size", map.mapSize);
  url.searchParams.set("seed", String(map.mapSeed));
  return url.toString();
}

/** The URL to reload on for `step`: the same size and camera, on seed − 1, seed + 1 or a random seed. */
export function steppedSeedUrl(href: string, map: MapRequest, step: SeedStep, random: () => number): string {
  const mapSeed = step === "random" ? randomMapSeed(random) : stepSeed(map.mapSeed, step);
  return pinnedMapUrl(href, { mapSize: map.mapSize, mapSeed });
}
