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
 *
 * On a fort port (`portHasFort`) the plan also finds the fort a site
 * (`planFortPad`) and levels a pad under it, so the fort never stands on a
 * plinth either.
 */
import { FORT_KEEP_TOP, FORT_REACH } from "./portFort";
import { VIEW_LINE_SLOPE } from "./islandMassifs";

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

/**
 * A fort's levelled pad (#84): a disc at one level under the fort and a
 * lattice step round it, faded into the terrain over its blend, inside the
 * same shore band as the terraces.
 */
export interface FortPad {
  x: number;
  z: number;
  /** The fort's turn about y: local +z (the sea front, the cannons) points this way; the gate faces back. */
  yaw: number;
  /** The pad's (and the fort's ground contact's) height. */
  level: number;
  /** The fort's own reach (bastion tips) at its scale. */
  reach: number;
  /** The flat pad's radius: the fort's reach plus one land-mesh lattice step, so every triangle under it is flat. */
  padRadius: number;
  blend: number;
}

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
  /** The fort's pad, on a fort port that has a site for one. */
  fort?: FortPad;
}

/** A port to plan a plateau for: its hex centre and the pier's heading (towards the water). */
export interface PlateauPort {
  x: number;
  z: number;
  toWater: number;
  /** Whether the port gets a fort (`portHasFort`). */
  hasFort?: boolean;
}

/** Fort site search: how far from the port centre, in what steps, and the land's most allowed spread under the fort before levelling. */
export const FORT_SEARCH_RADIUS = 1.4;
export const FORT_SEARCH_STEP = 0.05;
export const FORT_MAX_SPREAD = 0.22;
/** The fort keeps this far from the village plateau's plan and from the pier root (beyond its own reach), world units. */
export const FORT_TOWN_GAP = 0.04;
export const FORT_PIER_GAP = 0.18;
/** One land-mesh lattice step (`LAND_MESH_SPACING`): the flat pad reaches this far past the fort. */
export const FORT_PAD_MARGIN = 0.16;
export const FORT_PAD_BLEND = 0.22;
/**
 * Scoring a site: height over the square counts up to a cap (a fort wants
 * the high ground next to the town, not the summit); spread (earthworks)
 * counts against; standing seaward of the square counts for; distance from
 * the square counts against.
 */
const FORT_HEIGHT_WEIGHT = 1;
const FORT_HEIGHT_CAP = 0.12;
const FORT_SPREAD_WEIGHT = 1.0;
const FORT_SEAWARD_WEIGHT = 0.15;
const FORT_DISTANCE_WEIGHT = 0.3;
/** Room kept under the view line over a fort south of the square (world units). */
const FORT_VIEW_MARGIN = 0.05;

/** The natural ground under a fort of `reach` at (x, z): its lowest, highest and mean over the centre and two rings. */
export function fortGround(natural: (x: number, z: number) => number, x: number, z: number, reach: number) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  const probe = (px: number, pz: number) => {
    const h = natural(px, pz);
    min = Math.min(min, h);
    max = Math.max(max, h);
    sum += h;
    n++;
  };
  probe(x, z);
  for (const [count, r] of [
    [16, reach],
    [8, reach / 2],
  ]) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      probe(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
  }
  return { min, max, mean: sum / n };
}

/**
 * The fort's site beside a planned plateau, or undefined if no ground takes
 * it: within `FORT_SEARCH_RADIUS` of the port centre, wholly on land above
 * the shore band, its natural ground spreading no more than
 * `FORT_MAX_SPREAD`, clear of the village plateau and the pier root, and
 * under the camera's view line over the square if it stands south of it.
 * Of those, the highest and flattest, seaward of the square and near it.
 */
export function planFortPad(
  port: PlateauPort,
  plateau: Omit<TownPlateau, "fort">,
  pierRoot: { x: number; z: number },
  natural: (x: number, z: number) => number,
  buildingScale: number,
  wallTop: number,
  viewLineSlope: number
): FortPad | undefined {
  const reach = FORT_REACH * buildingScale;
  const dx = -plateau.ux;
  const dz = -plateau.uz;
  let best: { x: number; z: number; level: number; score: number } | undefined;
  for (let ox = -FORT_SEARCH_RADIUS; ox <= FORT_SEARCH_RADIUS + 1e-9; ox += FORT_SEARCH_STEP) {
    for (let oz = -FORT_SEARCH_RADIUS; oz <= FORT_SEARCH_RADIUS + 1e-9; oz += FORT_SEARCH_STEP) {
      if (Math.hypot(ox, oz) > FORT_SEARCH_RADIUS) continue;
      const x = port.x + ox;
      const z = port.z + oz;
      if (plateauPlanDistance(plateau, x, z) < reach + FORT_TOWN_GAP) continue;
      if (Math.hypot(x - pierRoot.x, z - pierRoot.z) < reach + FORT_PIER_GAP) continue;
      const g = fortGround(natural, x, z, reach);
      if (g.min < SHORE_KEEP_TOP + 0.005) continue;
      if (g.max - g.min > FORT_MAX_SPREAD) continue;
      // The pad's blend stays off the shore band too, or the band's fade would turn its bank into a cliff.
      if (fortGround(natural, x, z, reach + FORT_PAD_MARGIN + FORT_PAD_BLEND).min < SHORE_KEEP_TOP) continue;
      const level = g.mean;
      // South of the square (towards the camera) the fort's top stays under the line of sight to the square.
      if (z > plateau.z) {
        const south = Math.max(0, z - reach - plateau.z);
        const inCone = Math.abs(x - plateau.x) < 1 + south * 0.35 + reach;
        const line = plateau.levels[0] + south * viewLineSlope - FORT_VIEW_MARGIN;
        if (inCone && level + wallTop * buildingScale > line) continue;
      }
      const seaward = Math.max(-1, Math.min(1, ((x - plateau.x) * dx + (z - plateau.z) * dz) / 0.5));
      const score =
        FORT_HEIGHT_WEIGHT * Math.max(0, Math.min(level - plateau.levels[0], FORT_HEIGHT_CAP)) -
        FORT_SPREAD_WEIGHT * (g.max - g.min) +
        FORT_SEAWARD_WEIGHT * seaward -
        FORT_DISTANCE_WEIGHT * Math.hypot(x - plateau.x, z - plateau.z);
      if (!best || score > best.score) best = { x, z, level, score };
    }
  }
  if (!best) return undefined;
  // Seaward of the square the sea front faces away from it and the gate the
  // town; behind the town (a citadel on the high ground) the guns face the
  // harbour over the town, as the pier does.
  const seawardOfSquare = (best.x - plateau.x) * dx + (best.z - plateau.z) * dz >= 0;
  const yaw = seawardOfSquare ? Math.atan2(best.x - plateau.x, best.z - plateau.z) : Math.atan2(dx, dz);
  return { x: best.x, z: best.z, yaw, level: best.level, reach, padRadius: reach + FORT_PAD_MARGIN, blend: FORT_PAD_BLEND };
}

/** The pad's weight at (x, z): 1 over the pad, fading to 0 over its blend. */
export function fortPadWeight(pad: FortPad, x: number, z: number): number {
  return 1 - smoothstep((Math.hypot(x - pad.x, z - pad.z) - pad.padRadius) / pad.blend);
}

const smoothstep = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

/**
 * The plateau for a port, on the `natural` field (the field without
 * plateaus), at prop scale `scale`.
 */
export function planTownPlateau(
  port: PlateauPort,
  natural: (x: number, z: number) => number,
  scale: number,
  buildingScale = scale
): TownPlateau {
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
  const plateau: TownPlateau = {
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
  if (!port.hasFort) return plateau;
  const pierRoot = { x: port.x + dx * root, z: port.z + dz * root };
  const fort = planFortPad(port, plateau, pierRoot, natural, buildingScale, FORT_KEEP_TOP, VIEW_LINE_SLOPE);
  if (!fort) return plateau;
  const fortReach = Math.hypot(fort.x - x, fort.z - z) + fort.padRadius + fort.blend;
  return { ...plateau, fort, reach: Math.max(plateau.reach, fortReach) };
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
    const s = (px - p.x) * p.ux + (z - p.z) * p.uz;
    if (w > 0) out += w * (plateauLevel(p, s) - out);
    // The fort's pad last, so it wins where it meets the terraces' blend.
    if (p.fort) {
      const wf = fortPadWeight(p.fort, px, z) * keep;
      if (wf > 0) out += wf * (p.fort.level - out);
    }
  }
  return out;
}
