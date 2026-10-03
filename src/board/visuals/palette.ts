import { Color } from "three";

/**
 * Shared terrain and sea palette ("living sea chart" direction, issue #8).
 *
 * Hex values are authored in sRGB, as a designer would pick them.
 *
 * - TypeScript: `paletteColor(name)` returns a fresh three `Color`. three's
 *   colour management converts the sRGB hex into the linear working space, so
 *   it can go straight into a material or a `vec3` uniform.
 * - GLSL: shaders paste `PALETTE_GLSL` into their source. It declares one
 *   `const vec3 PALETTE_<NAME>` per entry (e.g. `PALETTE_SEABED_SAND`), holding
 *   the same linear values, which is what our pipeline expects: the
 *   EffectComposer renders in linear space and encodes to sRGB at the end.
 *   Injected constants keep shaders free of extra uniforms; switch an entry to
 *   a uniform only if it needs to change at runtime.
 */
/**
 * Land albedos (linear luminance, issue #38), compared with measured
 * shortwave albedos and raised only where they fell below them:
 * - jungle 0.15: Culf, Fisch & Hodnett (1995), "The Albedo of Amazonian
 *   Forest and Ranch Land", J. Climate 8:1544-1554, measured a mean forest
 *   albedo of 0.134 (ranch land 0.180) over several years at three sites.
 *   Was 0.11.
 * - highlandRock 0.28: weathered carbonate rock. Many Caribbean islands are
 *   limestone or coral (the Bahamas, the Caymans, much of the Greater
 *   Antilles). McGreevy, Warke & Smith (2000), "Controls on stone temperatures
 *   and the benefits of interdisciplinary exchange", J. Am. Inst. Conservation
 *   39(2), table 1, measured Antrim chalk at 0.25 and Antrim basalt at 0.12.
 *   0.28 sits a little above that single carbonate measurement, chosen to
 *   keep shadowed cliff faces readable. Was 0.15 (volcanic); the hue is
 *   unchanged.
 * - wetSand 0.32, drySand 0.63: unchanged. Both are bright for natural sand,
 *   so neither needed raising.
 * Measured values are broadband; visible-band canopy reflectance is lower, so
 * the jungle value errs bright.
 *
 * Seabed albedos (#38) are bottom reflectances sampled at 650 / 550 / 450 nm
 * for R / G / B (the same wavelengths as the water in waterOptics.ts), from
 * the spectra digitised from Fig. 6 of Maritorena, Morel &
 * Gentili (1994), "Diffuse reflectance of oceanic shallow waters: Influence of
 * water depth and bottom albedo", Limnology and Oceanography, as
 * distributed with Hydrolight 5 (coral_sand.txt, brown_algae.txt,
 * green_algae.txt):
 * - seabedSand: clean coral sand, 0.564 / 0.456 / 0.339.
 * - coral: brown algae (Turbinaria and Sargassum), 0.075 / 0.058 / 0.024. We
 *   could not source a measured live-coral spectrum; this dark brown one
 *   stands in for it.
 * - deepSeabed: a design choice for the drop-off, half coral sand and half
 *   green algae (Boodlea, 0.139 / 0.269 / 0.055).
 */
export const PALETTE_HEX = {
  wetSand: 0xb8925e, // Narrow band at the waterline (albedo 0.32)
  drySand: 0xe3cf9c, // Beaches (albedo 0.63)
  jungle: 0x367a43, // Elevation 2: rainforest canopy (albedo 0.15, Culf et al. 1995)
  highlandRock: 0x9d8d79, // Elevation 3, steep slopes: weathered limestone (albedo 0.28; chalk measured 0.25, McGreevy et al. 2000)
  surf: 0xf2faf7, // Shore foam
  palmFrond: 0x4f8a34, // Palm fronds, a sunlit step up from the jungle floor (issue #14)
  palmTrunk: 0x8a6a45, // Palm trunks and coconuts
  seabedSand: 0xc6b49d, // Shallow seabed: clean coral sand (Maritorena et al. 1994)
  coral: 0x4d442b, // Reef coral heads (brown-algae spectrum as a stand-in)
  deepSeabed: 0xa0a27b, // Seabed down the drop-off: half sand, half green algae
} as const;

export type PaletteName = keyof typeof PALETTE_HEX;

export const PALETTE_NAMES = Object.keys(PALETTE_HEX) as PaletteName[];

/** A new three `Color` (linear working space) for a palette entry. */
export function paletteColor(name: PaletteName): Color {
  return new Color(PALETTE_HEX[name]);
}

/** Formats a `Color`'s linear components as a GLSL `vec3(...)` literal. */
export function glslVec3(color: Color): string {
  const f = (v: number) => v.toFixed(4);
  return `vec3(${f(color.r)}, ${f(color.g)}, ${f(color.b)})`;
}

/** `seabedSand` -> `PALETTE_SEABED_SAND`. */
export function glslConstName(name: PaletteName): string {
  return `PALETTE_${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/** GLSL snippet declaring every palette entry as a `const vec3`. */
export const PALETTE_GLSL = PALETTE_NAMES.map(
  (name) => `const vec3 ${glslConstName(name)} = ${glslVec3(paletteColor(name))};`
).join("\n");
