/**
 * Town plateaus (#84, prototype): a term in the one terrain height field
 * (ADR 0001) that shapes the land round each port's quay square into gentle
 * terraces, so a village at the #84 prop scale has ground its houses can
 * stand on without plinths. Pure, no Three.js. Off by default: the field
 * builds none unless asked (`townPlateaus` in `TerrainHeightFieldOptions`).
 *
 * Each plateau is planned from the port cell, its pier's heading and the
 * field as it would be without it (`natural`):
 *
 * - The square sits where the port kit's square stands (the settlement
 *   scaled about the pier root, `portSettlement.ts`), a disc of
 *   `SQUARE_RADIUS` at level L0: the natural height there, kept between
 *   `SHORE_KEEP_TOP` and one riser above it, so the square meets the beach
 *   with at most a low bank.
 * - Inland along the pier's line, one to three terraces of equal length up
 *   to `LENGTH`, each exactly flat, stepping up by at most `RISER` (as many
 *   as the natural rise asks for, never down), joined by `RAMP`-long
 *   smoothstep ramps. Across, the terraces reach `HALF_WIDTH` either side of
 *   the axis.
 * - Outside that plan the plateau fades into the untouched terrain over
 *   `BLEND` (a smoothstep in the distance from the plan), so the field stays
 *   continuous with a continuous slope.
 * - It never touches the shore: the weight is also faded in by the natural
 *   height, from 0 at `SHORE_KEEP_BOTTOM` to 1 at `SHORE_KEEP_TOP`. Below
 *   the bottom the field is untouched, so the coastline (height 0), the
 *   pier's shore contact (`PIER_SHORE_HEIGHT`, 0.02) and the quay's sea face
 *   stay where they were; and since the result lies between the natural
 *   height and a level above the bottom, the land stays above the sea.
 *
 * Every length here is at scale 1 and multiplied by the plan's `scale` (the
 * #84 prop scale), except the shore band, which is a height on the beach and
 * stays as it is.
 */

/** The square's radius, at scale 1 (the port kit's square plus room round it). */
export const SQUARE_RADIUS = 0.6;
/** How far inland of the square's centre the terraces reach, at scale 1. */
export const LENGTH = 2.6;
/** Half-width of the terraces across the main street, at scale 1. */
export const HALF_WIDTH = 0.85;
/** Where the first terrace starts beyond the square's centre, at scale 1. */
export const SQUARE_END = 0.5;
/** Most a terrace steps up from the one before, at scale 1 (~4 m at a 350 m hex). */
export const RISER = 0.06;
/** Length of the ramp between two terraces, at scale 1. */
export const RAMP = 0.18;
/** Width over which the plateau fades into the untouched terrain, at scale 1. */
export const BLEND = 0.7;
/** Natural heights at and under which the plateau leaves the ground alone, and over which it applies fully (world units). */
export const SHORE_KEEP_BOTTOM = 0.021;
export const SHORE_KEEP_TOP = 0.032;
/** Most terraces a plateau has. */
export const MAX_TERRACES = 3;
/** The pier-root search, as `pierPlacement.ts` walks it (world units), and its land overlap at scale 1. */
const PIER_SHORE_MIN = 0.5;
const PIER_SHORE_MAX = 0.85;
const PIER_SHORE_HEIGHT = 0.02;
const PIER_LAND_OVERLAP = 0.12;
const SEARCH_STEP = 0.025;

export interface TownPlateau {
  /** The square's centre. */
  x: number;
  z: number;
  /** Unit direction inland (away from the pier). */
  ux: number;
  uz: number;
  /** L0 (the square), then one level per terrace. */
  levels: readonly number[];
  /** Distance inland of the centre where each terrace's ramp starts (one per terrace). */
  steps: readonly number[];
  /** Lengths at this plateau's scale. */
  squareRadius: number;
  length: number;
  halfWidth: number;
  ramp: number;
  blend: number;
  /** Farthest any point of the plateau's influence lies from its centre (for a quick reject). */
  reach: number;
}

/** A port to plan a plateau for: its hex centre and the pier's heading (towards the water). */
export interface PlateauPort {
  x: number;
  z: number;
  toWater: number;
}

const smoothstep = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

/**
 * The plateau for a port, on the `natural` field (the field without
 * plateaus), at prop scale `scale`.
 */
export function planTownPlateau(port: PlateauPort, natural: (x: number, z: number) => number, scale: number): TownPlateau {
  const dx = Math.sin(port.toWater);
  const dz = Math.cos(port.toWater);
  // The pier root as pierPlacement.ts finds it, then the kit's square: the
  // hex centre's offset from the root, scaled.
  let shore = PIER_SHORE_MAX;
  for (let d = PIER_SHORE_MIN; d <= PIER_SHORE_MAX + 1e-9; d += SEARCH_STEP) {
    if (natural(port.x + dx * d, port.z + dz * d) <= PIER_SHORE_HEIGHT) {
      shore = d;
      break;
    }
  }
  const root = shore - PIER_LAND_OVERLAP * scale;
  const fromRoot = root * (1 - scale);
  const x = port.x + dx * fromRoot;
  const z = port.z + dz * fromRoot;
  const ux = -dx;
  const uz = -dz;

  const squareRadius = SQUARE_RADIUS * scale;
  const length = LENGTH * scale;
  const riser = RISER * scale;
  const squareEnd = SQUARE_END * scale;

  const l0 = Math.max(SHORE_KEEP_TOP, Math.min(natural(x, z), SHORE_KEEP_TOP + riser));
  const rise = natural(x + ux * length, z + uz * length) - l0;
  const count = Math.max(1, Math.min(MAX_TERRACES, Math.ceil(rise / riser)));
  const span = (length - squareEnd) / count;
  const levels = [l0];
  const steps: number[] = [];
  for (let k = 0; k < count; k++) {
    const start = squareEnd + k * span;
    const mid = start + span / 2;
    const want = natural(x + ux * mid, z + uz * mid);
    const prev = levels[levels.length - 1];
    levels.push(Math.max(prev, Math.min(want, prev + riser)));
    steps.push(start);
  }
  const ramp = RAMP * scale;
  const blend = BLEND * scale;
  return {
    x,
    z,
    ux,
    uz,
    levels,
    steps,
    squareRadius,
    length,
    halfWidth: HALF_WIDTH * scale,
    ramp,
    blend,
    reach: Math.hypot(length, HALF_WIDTH * scale) + blend + squareRadius,
  };
}

/** The terraced height at `s` along the axis (inland of the centre). */
export function plateauLevel(p: TownPlateau, s: number): number {
  let level = p.levels[0];
  for (let k = 0; k < p.steps.length; k++) {
    level += (p.levels[k + 1] - p.levels[k]) * smoothstep((s - p.steps[k]) / p.ramp);
  }
  return level;
}

/** Distance from (x, z) to the plateau's plan (0 inside): the square's disc and the terraces' strip. */
export function plateauPlanDistance(p: TownPlateau, x: number, z: number): number {
  const rx = x - p.x;
  const rz = z - p.z;
  const disc = Math.max(0, Math.hypot(rx, rz) - p.squareRadius);
  const s = rx * p.ux + rz * p.uz;
  const across = Math.abs(-rx * p.uz + rz * p.ux);
  const outAlong = s < 0 ? -s : s > p.length ? s - p.length : 0;
  const outAcross = Math.max(0, across - p.halfWidth);
  const strip = Math.hypot(outAlong, outAcross);
  return Math.min(disc, strip);
}

/** The plan weight at (x, z): 1 on the plateau, fading to 0 over its blend width. */
export function plateauWeight(p: TownPlateau, x: number, z: number): number {
  return 1 - smoothstep(plateauPlanDistance(p, x, z) / p.blend);
}

/** How much of the plateau the ground at natural height `h` takes: none on the beach under the shore band. */
export function shoreKeep(h: number): number {
  return smoothstep((h - SHORE_KEEP_BOTTOM) / (SHORE_KEEP_TOP - SHORE_KEEP_BOTTOM));
}

/**
 * The land height at (x, z) with the plateaus applied to the natural land
 * height `h` (above sea level only; under it nothing changes). `periodX`
 * wraps the plateaus east–west.
 */
export function applyTownPlateaus(plateaus: readonly TownPlateau[], x: number, z: number, h: number, periodX: number | null): number {
  if (h <= SHORE_KEEP_BOTTOM) return h;
  const keep = shoreKeep(h);
  let out = h;
  for (const p of plateaus) {
    let px = x;
    if (periodX !== null) px = p.x + ((((x - p.x) % periodX) + periodX * 1.5) % periodX) - periodX / 2;
    if (Math.abs(px - p.x) > p.reach || Math.abs(z - p.z) > p.reach) continue;
    const w = plateauWeight(p, px, z) * keep;
    if (w <= 0) continue;
    const s = (px - p.x) * p.ux + (z - p.z) * p.uz;
    out += w * (plateauLevel(p, s) - out);
  }
  return out;
}
