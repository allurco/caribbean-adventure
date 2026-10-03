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
 *   `const vec3 PALETTE_<NAME>` per entry (e.g. `PALETTE_DEEP_WATER`), holding
 *   the same linear values, which is what our pipeline expects: the
 *   EffectComposer renders in linear space and encodes to sRGB at the end.
 *   Injected constants keep shaders free of extra uniforms; switch an entry to
 *   a uniform only if it needs to change at runtime.
 */
/**
 * Land albedos (linear luminance, issue #38) are checked against measured
 * shortwave albedos and raised only where they fell below the range:
 * - jungle 0.15: tropical rainforest canopy, about 0.12-0.14 measured over
 *   Amazonian forest (Culf, Fisch & Hodnett 1995, J. Climate 8:1544); range
 *   0.12-0.18 with drier canopy. Was 0.11.
 * - highlandRock 0.15: dark volcanic rock, 0.10-0.15. Already in range.
 * - wetSand 0.32, drySand 0.63: at or above wet sand 0.20-0.30 and dry sand
 *   0.35-0.45 (Oke 1987, Boundary Layer Climates, table 1.1). Not lowered.
 * These are broadband values; visible-band canopy reflectance is lower, so the
 * jungle value errs bright.
 */
export const PALETTE_HEX = {
  deepWater: 0x0e3a5b, // Open sea
  reefTeal: 0x1c8c8c, // Reefs, mid-depth water
  shallows: 0x5fd4c9, // Water next to the shore
  wetSand: 0xb8925e, // Narrow band at the waterline (albedo 0.32)
  drySand: 0xe3cf9c, // Beaches (albedo 0.63)
  jungle: 0x367a43, // Elevation 2: rainforest canopy (albedo 0.15, Culf et al. 1995)
  highlandRock: 0x76695a, // Elevation 3, steep slopes: volcanic rock (albedo 0.15)
  surf: 0xf2faf7, // Shore foam
  palmFrond: 0x4f8a34, // Palm fronds, a sunlit step up from the jungle floor (issue #14)
  palmTrunk: 0x8a6a45, // Palm trunks and coconuts
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

/** `deepWater` -> `PALETTE_DEEP_WATER`. */
export function glslConstName(name: PaletteName): string {
  return `PALETTE_${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/** GLSL snippet declaring every palette entry as a `const vec3`. */
export const PALETTE_GLSL = PALETTE_NAMES.map(
  (name) => `const vec3 ${glslConstName(name)} = ${glslVec3(paletteColor(name))};`
).join("\n");
