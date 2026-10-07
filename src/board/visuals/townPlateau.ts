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
 *
 * The detail pass (#84) adds the streets to the same term, so they are
 * ground and not a decal on it:
 *
 * - The plan lays the village's streets: a main street straight up the
 *   terraces from the square, a back lane either side of it, and a lane
 *   across the middle of the first one or two terraces. Each is carved a
 *   shallow `STREET_CARVE` into the terrace, flat across most of its width
 *   and rising to the terrace at its edges, where the kerb stones stand.
 * - A riser is a short steep face (`RISER_FACE`) that the dry-stone
 *   retaining walls stand against, except where a main street or back lane
 *   climbs it: there it is the full `RAMP`, so the street runs up a slope
 *   with the wall either side of it.
 * - On a fort port the plan lays a road from the fort's gate down to the
 *   nearest street end or the square, zig-zagging across the slope when the
 *   straight line would be steeper than `FORT_ROAD_GRADE`. The road is a
 *   bench cut along its line at a steady grade, faded back into the slope
 *   over its shoulder.
 */
import { FORT_KEEP_TOP, FORT_REACH } from "./portFort";
import { FORT_CURTAIN } from "./fortGeometry";
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
/** A riser's face where no street climbs it, at scale 1 (~2 m at a 350 m hex): steep, for the retaining wall to stand against. */
export const RISER_FACE = 0.03;
/** Street half widths at scale 1: the main street (~7 m across) and the lanes (~5 m). */
export const MAIN_STREET_HALF = 0.055;
export const LANE_HALF = 0.036;
/** How deep a street is carved into its terrace, at scale 1 (~0.5 m), and the share of its half width that is flat bottom. */
export const STREET_CARVE = 0.008;
export const STREET_FLAT = 0.6;
/** At the building scale: a retaining wall's depth at its foot (in front of the riser's face), and a kerb stone's width (`townDetailLayout.ts`). */
export const RETAINING_WALL_DEPTH = 0.012;
export const KERB_WIDTH = 0.008;
/** The back lanes' offset from the main street, at the building scale: two house depths and the main street between them. */
export const BACK_LANE_OFFSET = 0.58;
/** Across a riser, the ramp narrows to the face over this much either side of a climbing street, at scale 1. */
const RAMP_SHOULDER = 0.05;
/** The fort road, at scale 1: half width (~5 m across), the shoulder it fades back into the slope over, its steepest grade, the zig-zag's widest swing and most legs. */
export const FORT_ROAD_HALF = 0.04;
export const FORT_ROAD_SHOULDER = 0.09;
export const FORT_ROAD_GRADE = 0.14;
const FORT_ROAD_SWING = 0.6;
export const FORT_ROAD_MAX_LEGS = 10;

/** A street of the village plan: a straight run between two points (world units). */
export interface TownStreet {
  kind: "main" | "back" | "cross";
  from: readonly [number, number];
  to: readonly [number, number];
  halfWidth: number;
}

/** The road from a fort's gate down to the town: a polyline and the road bed's height at each point. */
export interface FortRoad {
  points: readonly (readonly [number, number])[];
  levels: readonly number[];
  halfWidth: number;
  shoulder: number;
}
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
  /** A riser's steep face where no street climbs it, at this plateau's scale. */
  riserFace: number;
  /** The streets, carved `carve` deep. */
  streets: readonly TownStreet[];
  carve: number;
  /** Offsets across the axis of the streets that climb the risers (the main street and the back lanes), and their ramp's half width. */
  climbs: readonly number[];
  climbHalf: number;
  rampShoulder: number;
  /** The fort's pad, on a fort port that has a site for one. */
  fort?: FortPad;
  /** The road from the fort's gate down to the town. */
  fortRoad?: FortRoad;
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
  plateau: Omit<TownPlateau, "fort" | "fortRoad">,
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
  const halfWidth = HALF_WIDTH * scale;
  const mainHalf = MAIN_STREET_HALF * scale;
  const laneHalf = LANE_HALF * scale;
  // The back lanes stay inside the terraces with a lane's width to spare.
  const back = Math.min(BACK_LANE_OFFSET * buildingScale, halfWidth - 2 * laneHalf);
  const plateau: TownPlateau = {
    x,
    z,
    ux,
    uz,
    levels,
    steps,
    squareRadius,
    length,
    halfWidth,
    ramp,
    blend,
    reach: Math.hypot(length, halfWidth) + blend + squareRadius,
    riserFace: RISER_FACE * scale,
    streets: [],
    carve: STREET_CARVE * scale,
    climbs: [0, back, -back],
    climbHalf: mainHalf,
    rampShoulder: RAMP_SHOULDER * scale,
  };
  plateau.streets = planStreets(plateau, mainHalf, laneHalf, back);
  if (!port.hasFort) return plateau;
  const pierRoot = { x: port.x + dx * root, z: port.z + dz * root };
  const fort = planFortPad(port, plateau, pierRoot, natural, buildingScale, FORT_KEEP_TOP, VIEW_LINE_SLOPE);
  if (!fort) return plateau;
  const fortRoad = planFortRoad(plateau, fort, buildingScale, scale);
  let fortReach = Math.hypot(fort.x - x, fort.z - z) + fort.padRadius + fort.blend;
  for (const [px, pz] of fortRoad.points) fortReach = Math.max(fortReach, Math.hypot(px - x, pz - z) + fortRoad.halfWidth + fortRoad.shoulder);
  return { ...plateau, fort, fortRoad, reach: Math.max(plateau.reach, fortReach) };
}

/** Local frame: (x, z) as distance inland of the centre and offset across the axis. */
export function plateauLocal(p: TownPlateau, x: number, z: number): { s: number; across: number } {
  const rx = x - p.x;
  const rz = z - p.z;
  return { s: rx * p.ux + rz * p.uz, across: -rx * p.uz + rz * p.ux };
}

/** World point at `s` inland of the centre and `across` the axis. */
export function plateauPoint(p: TownPlateau, s: number, across: number): [number, number] {
  return [p.x + p.ux * s - p.uz * across, p.z + p.uz * s + p.ux * across];
}

/** Where riser `k`'s face is centred, along the axis. */
export const riserCentre = (p: TownPlateau, k: number): number => p.steps[k] + p.ramp / 2;

/** The streets of a planned plateau: the main street, the back lanes either side and a lane across each of the first one or two terraces. */
function planStreets(p: TownPlateau, mainHalf: number, laneHalf: number, back: number): TownStreet[] {
  const start = p.squareRadius * 0.5;
  const streets: TownStreet[] = [{ kind: "main", from: plateauPoint(p, start, 0), to: plateauPoint(p, p.length, 0), halfWidth: mainHalf }];
  // The back lanes start where the square's disc ends either side of the main street.
  const backStart = Math.sqrt(Math.max(0, p.squareRadius * p.squareRadius - back * back));
  for (const side of [1, -1]) {
    streets.push({ kind: "back", from: plateauPoint(p, backStart, side * back), to: plateauPoint(p, p.length - laneHalf, side * back), halfWidth: laneHalf });
  }
  const terraces = p.steps.length;
  for (let k = 0; k < Math.min(2, terraces); k++) {
    const from = riserCentre(p, k);
    const to = k + 1 < terraces ? riserCentre(p, k + 1) : p.length;
    const s = (from + to) / 2;
    streets.push({ kind: "cross", from: plateauPoint(p, s, -p.halfWidth), to: plateauPoint(p, s, p.halfWidth), halfWidth: laneHalf });
  }
  return streets;
}

/** Distance from (x, z) to the segment a→b, and how far along it (0…1) the nearest point is. */
function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
  return { d: Math.hypot(x - (ax + vx * t), z - (az + vz * t)), t };
}

/** Distance from (x, z) to a street's centre line. */
export const streetDistance = (street: TownStreet, x: number, z: number): number =>
  segmentDistance(x, z, street.from[0], street.from[1], street.to[0], street.to[1]).d;

/** How much of a street's carve (0…1) reaches (x, z): the full depth over its flat bottom, rising to nothing at its edge. */
export function streetCarveAt(p: TownPlateau, x: number, z: number): number {
  let best = 0;
  for (const street of p.streets) {
    const d = streetDistance(street, x, z);
    if (d >= street.halfWidth) continue;
    const flat = street.halfWidth * STREET_FLAT;
    best = Math.max(best, 1 - smoothstep((d - flat) / (street.halfWidth - flat)));
  }
  return best;
}

/**
 * The fort road: from the edge of the fort's pad in front of its gate to the
 * nearest street end or point of the square, a straight run if that is no
 * steeper than `FORT_ROAD_GRADE`, else legs zig-zagging across the line,
 * as many as the grade needs (at most `FORT_ROAD_MAX_LEGS`, swinging at
 * most `FORT_ROAD_SWING` either side). The bed falls at a steady grade from
 * the pad to the street.
 */
export function planFortRoad(p: TownPlateau, fort: FortPad, buildingScale: number, scale: number): FortRoad {
  const gx = -Math.sin(fort.yaw);
  const gz = -Math.cos(fort.yaw);
  // The gate is in the curtain; the road starts at the pad's edge in front of it.
  const lead = Math.max(fort.padRadius, FORT_CURTAIN * buildingScale);
  const start: [number, number] = [fort.x + gx * lead, fort.z + gz * lead];
  const candidates: [number, number][] = [];
  for (const street of p.streets) candidates.push([street.from[0], street.from[1]], [street.to[0], street.to[1]]);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    candidates.push([p.x + Math.sin(a) * p.squareRadius * 0.9, p.z + Math.cos(a) * p.squareRadius * 0.9]);
  }
  const end = candidates.reduce((a, b) => (Math.hypot(b[0] - start[0], b[1] - start[1]) < Math.hypot(a[0] - start[0], a[1] - start[1]) ? b : a));
  const { s, across } = plateauLocal(p, end[0], end[1]);
  const endLevel = plateauLevel(p, s, across);
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const distance = Math.hypot(dx, dz) || 1e-9;
  const drop = Math.abs(fort.level - endLevel);
  const needed = drop / FORT_ROAD_GRADE;
  const nx = -dz / distance;
  const nz = dx / distance;
  /** The zig-zag of `legs` legs swinging `swing` either side of the line. */
  const zigzag = (legs: number, swing: number): [number, number][] => {
    const out: [number, number][] = [start];
    for (let i = 1; i < legs; i++) {
      const t = i / legs;
      const side = i % 2 === 1 ? 1 : -1;
      out.push([start[0] + dx * t + nx * swing * side, start[1] + dz * t + nz * swing * side]);
    }
    out.push(end);
    return out;
  };
  const pathLength = (pts: readonly [number, number][]) => {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return l;
  };
  let points: [number, number][] = [start, end];
  if (needed > distance) {
    // The fewest legs that reach the length at the widest swing, then the swing that just does.
    const swingMax = FORT_ROAD_SWING * scale;
    let legs = 2;
    while (legs < FORT_ROAD_MAX_LEGS && pathLength(zigzag(legs, swingMax)) < needed) legs++;
    let lo = 0;
    let hi = swingMax;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (pathLength(zigzag(legs, mid)) < needed) lo = mid;
      else hi = mid;
    }
    points = zigzag(legs, hi);
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lengths[lengths.length - 1] || 1;
  const levels = lengths.map((l) => fort.level + (endLevel - fort.level) * (l / total));
  return { points, levels, halfWidth: FORT_ROAD_HALF * scale, shoulder: FORT_ROAD_SHOULDER * scale };
}

/**
 * The fort road's pull at (x, z): its weight (1 on the bed, fading to 0
 * over the shoulder) and the bed's height there. Where two legs come near
 * each other (at a hairpin) their beds blend by weight.
 */
export function fortRoadAt(road: FortRoad, x: number, z: number): { weight: number; level: number } {
  let weight = 0;
  let sum = 0;
  let sumLevel = 0;
  for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1];
    const [bx, bz] = road.points[i];
    const { d, t } = segmentDistance(x, z, ax, az, bx, bz);
    const w = 1 - smoothstep((d - road.halfWidth) / road.shoulder);
    if (w <= 0) continue;
    const level = road.levels[i - 1] + (road.levels[i] - road.levels[i - 1]) * t;
    const w4 = w * w * w * w;
    weight = Math.max(weight, w);
    sum += w4;
    sumLevel += w4 * level;
  }
  return { weight, level: sum > 0 ? sumLevel / sum : 0 };
}

/** Distance from (x, z) to the fort road's centre line. */
export function fortRoadDistance(road: FortRoad, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1];
    const [bx, bz] = road.points[i];
    best = Math.min(best, segmentDistance(x, z, ax, az, bx, bz).d);
  }
  return best;
}

/** How much of the ramp a riser keeps at `across` (1 on a climbing street, 0 at the bare face). */
export function climbWeight(p: TownPlateau, across: number): number {
  let best = 0;
  for (const c of p.climbs) best = Math.max(best, 1 - smoothstep((Math.abs(across - c) - p.climbHalf) / p.rampShoulder));
  return best;
}

/**
 * The terraced height at `s` along the axis (inland of the centre) and
 * `across` it: each riser is a steep face, widening to the full ramp where
 * a street climbs it. Without `across` the riser is the full ramp.
 */
export function plateauLevel(p: TownPlateau, s: number, across?: number): number {
  const climb = across === undefined ? 1 : climbWeight(p, across);
  const run = p.riserFace + (p.ramp - p.riserFace) * climb;
  let level = p.levels[0];
  for (let k = 0; k < p.steps.length; k++) {
    const c = riserCentre(p, k);
    level += (p.levels[k + 1] - p.levels[k]) * smoothstep((s - (c - run / 2)) / run);
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
    if (w > 0) {
      const { s, across } = plateauLocal(p, px, z);
      out += w * (plateauLevel(p, s, across) - out);
      // The streets, carved into the terraces.
      const carve = streetCarveAt(p, px, z);
      if (carve > 0) out -= w * carve * p.carve;
    }
    // The fort road's bench, then the fort's pad last, so it wins where it meets the terraces' blend.
    if (p.fortRoad) {
      const road = fortRoadAt(p.fortRoad, px, z);
      if (road.weight > 0) out += road.weight * keep * (road.level - out);
    }
    if (p.fort) {
      const wf = fortPadWeight(p.fort, px, z) * keep;
      if (wf > 0) out += wf * (p.fort.level - out);
    }
  }
  return out;
}
