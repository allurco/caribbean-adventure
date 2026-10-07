/**
 * Town plateaus (#87, ADR 0003): a term in the one terrain height field
 * (ADR 0001) that shapes the land round each port's quay square into
 * terraces, so the village has ground its houses stand on without plinths,
 * and carves its streets into them (ADR 0002: ground features are terrain).
 * Pure, no Three.js.
 *
 * Each plateau is planned from the port cell, its pier's heading and the
 * field as it would be without plateaus (`natural`):
 *
 * - The square sits where the port kit's square stands (the settlement laid
 *   out round the pier root, `settlementCentre` in `portSettlement.ts`), a
 *   disc of `SQUARE_RADIUS` at level L0: the natural height there, kept
 *   between `SHORE_KEEP_TOP` and one riser above it, so the square meets the
 *   beach with at most a low bank.
 * - Inland along the pier's line, one to three terraces of equal length up
 *   to `LENGTH`, each exactly flat, stepping up by at most `RISER` (as many
 *   as the natural rise asks for, never down). Across, the terraces reach
 *   `HALF_WIDTH` either side of the axis.
 * - A riser is a short steep face (`RISER_FACE`, about 2 m) that the
 *   dry-stone retaining walls stand against, except where the main street or
 *   a back lane climbs it: there it is the full `RAMP`, so the street runs up
 *   a slope with the wall either side of it.
 * - The streets: a main street straight up the terraces from the square, a
 *   back lane either side of it, and a lane across the middle of the first
 *   one or two terraces, all clear of the square, which is the port kit's.
 *   Each is carved `STREET_CARVE` (about 0.5 m) into its
 *   terrace, flat across most of its width and rising to the terrace at its
 *   edges, where the kerb stones stand.
 * - Outside that plan the plateau fades into the untouched terrain over
 *   `BLEND` (a smoothstep in the distance from the plan), so the field stays
 *   continuous.
 * - It never touches the shore: the weight is also faded in by the natural
 *   height, from 0 at `SHORE_KEEP_BOTTOM` to 1 at `SHORE_KEEP_TOP`. Below the
 *   bottom the field is untouched, so the coastline (height 0), the pier's
 *   shore contact and the quay's sea face stay where they were; and since the
 *   result lies between the natural height and a level above the bottom, the
 *   land stays above the sea.
 *
 * Lengths are authored for the 115 m hex and drawn at the plan's `scale`
 * (`PROP_SCALE`), except the shore band, which is a height on the beach, and
 * the back lanes' offset, which follows the houses (`BUILDING_SCALE`).
 */

/** The square's radius, at scale 1 (the port kit's square plus room round it). */
export const SQUARE_RADIUS = 0.6;
/** How far inland of the square's centre the terraces reach, at scale 1: lengthened with `SQUARE_END`, so the terraces keep their room for the village. */
export const LENGTH = 2.95;
/** Half-width of the terraces across the main street, at scale 1. */
export const HALF_WIDTH = 0.85;
/**
 * Where the first terrace starts beyond the square's centre, at scale 1: past
 * the port kit (`portSettlement.ts`), so its buildings stand on the square's
 * one level and none straddles the first riser. The church, straight inland
 * of the square, reaches furthest, about 0.25 world units (0.75 at scale 1);
 * this keeps its back and the retaining wall's foot clear of the ramp.
 */
export const SQUARE_END = 0.85;
/** Most a terrace steps up from the one before, at scale 1 (about 4 m at the 350 m hex). */
export const RISER = 0.06;
/** Length of the ramp a street climbs a riser by, at scale 1. */
export const RAMP = 0.18;
/** Width over which the plateau fades into the untouched terrain, at scale 1. */
export const BLEND = 0.7;
/** Natural heights at and under which the plateau leaves the ground alone, and over which it applies fully (world units). */
export const SHORE_KEEP_BOTTOM = 0.021;
export const SHORE_KEEP_TOP = 0.032;
/** Most terraces a plateau has. */
export const MAX_TERRACES = 3;
/** A riser's face where no street climbs it, at scale 1 (about 2 m at the 350 m hex): steep, for the retaining wall to stand against. */
export const RISER_FACE = 0.03;
/** Street half widths at scale 1: the main street (about 7 m across) and the lanes (about 5 m). */
export const MAIN_STREET_HALF = 0.055;
export const LANE_HALF = 0.036;
/** How deep a street is carved into its terrace, at scale 1 (about 0.5 m), and the share of its half width that is flat bottom. */
export const STREET_CARVE = 0.008;
export const STREET_FLAT = 0.6;
/** At the building scale: a retaining wall's depth at its foot (in front of the riser's face), and a kerb stone's width (`townDetailLayout.ts`). */
export const RETAINING_WALL_DEPTH = 0.012;
export const KERB_WIDTH = 0.008;
/** The back lanes' offset from the main street, at the building scale: two house depths and the main street between them. */
export const BACK_LANE_OFFSET = 0.58;
/** Across a riser, the ramp narrows to the face over this much either side of a climbing street, at scale 1. */
const RAMP_SHOULDER = 0.05;
/** The pier-root search, as `pierPlacement.ts` walks it (world units), and its land overlap at scale 1. */
const PIER_SHORE_MIN = 0.5;
const PIER_SHORE_MAX = 0.85;
const PIER_SHORE_HEIGHT = 0.02;
const PIER_LAND_OVERLAP = 0.12;
const SEARCH_STEP = 0.025;

/** A street of the village plan: a straight run between two points (world units). */
export interface TownStreet {
  kind: "main" | "back" | "cross";
  from: readonly [number, number];
  to: readonly [number, number];
  halfWidth: number;
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
  /** Distance inland of the centre where each terrace's riser starts (one per terrace). */
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
 * plateaus), at prop scale `scale`; the back lanes are spaced for houses at
 * `buildingScale`.
 */
export function planTownPlateau(port: PlateauPort, natural: (x: number, z: number) => number, scale: number, buildingScale = scale): TownPlateau {
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
  return plateau;
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

/**
 * The streets of a planned plateau: the main street, the back lanes either
 * side and a lane across each of the first one or two terraces. Every one
 * leaves the square at its inland edge, where the first terrace's ramp
 * starts: the square is the port kit's, and a street through it would run
 * under the church (#87).
 */
function planStreets(p: TownPlateau, mainHalf: number, laneHalf: number, back: number): TownStreet[] {
  const start = p.steps[0];
  const streets: TownStreet[] = [{ kind: "main", from: plateauPoint(p, start, 0), to: plateauPoint(p, p.length, 0), halfWidth: mainHalf }];
  for (const side of [1, -1]) {
    streets.push({ kind: "back", from: plateauPoint(p, start, side * back), to: plateauPoint(p, p.length - laneHalf, side * back), halfWidth: laneHalf });
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

/** Distance from (x, z) to the segment a→b. */
export function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

/** Distance from (x, z) to a street's centre line. */
export const streetDistance = (street: TownStreet, x: number, z: number): number =>
  segmentDistance(x, z, street.from[0], street.from[1], street.to[0], street.to[1]);

/** Twice the signed area of the triangle a, b, c (positive turning left). */
const cross2 = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

/** Whether the segments a→b and c→d cross or touch. */
function segmentsMeet(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const d1 = cross2(cx, cz, dx, dz, ax, az);
  const d2 = cross2(cx, cz, dx, dz, bx, bz);
  const d3 = cross2(ax, az, bx, bz, cx, cz);
  const d4 = cross2(ax, az, bx, bz, dx, dz);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

/** Whether (x, z) lies inside a convex polygon given by its corners in order. */
function insideConvex(corners: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    const c = Math.sign(cross2(ax, az, bx, bz, x, z));
    if (c === 0) continue;
    if (sign === 0) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}

/** Distance between a street's centre line and a convex footprint (its corners in order): 0 where they meet. */
function streetFootprintDistance(street: TownStreet, corners: readonly (readonly [number, number])[]): number {
  const [ax, az] = street.from;
  const [bx, bz] = street.to;
  if (insideConvex(corners, ax, az)) return 0;
  let best = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const [cx, cz] = corners[i];
    const [dx, dz] = corners[(i + 1) % corners.length];
    if (segmentsMeet(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
    best = Math.min(best, segmentDistance(cx, cz, ax, az, bx, bz), segmentDistance(ax, az, cx, cz, dx, dz), segmentDistance(bx, bz, cx, cz, dx, dz));
  }
  return best;
}

/**
 * Whether a footprint (a convex outline, its corners in order, in the
 * world) touches any of the plateau's streets: comes within the street's
 * half width plus `margin` (its kerbs or edge stones) of its centre line,
 * anywhere along its walls, not only at a corner.
 */
export function footprintOnStreet(p: TownPlateau, corners: readonly (readonly [number, number])[], margin: number): boolean {
  return p.streets.some((street) => streetFootprintDistance(street, corners) < street.halfWidth + margin);
}

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

/**
 * Whether a footprint (its corners in the world) crosses one of the
 * plateau's risers where it stands: the riser's run (the steep face, or the
 * ramp where a street climbs it) plus the retaining wall of depth
 * `wallDepth` standing at its foot. Only within the terraces' width and
 * blend, where the risers are.
 */
export function crossesRiser(p: TownPlateau, corners: readonly (readonly [number, number])[], wallDepth: number): boolean {
  let s0 = Infinity;
  let s1 = -Infinity;
  let a0 = Infinity;
  let a1 = -Infinity;
  let run = 0;
  for (const [x, z] of corners) {
    const l = plateauLocal(p, x, z);
    s0 = Math.min(s0, l.s);
    s1 = Math.max(s1, l.s);
    a0 = Math.min(a0, l.across);
    a1 = Math.max(a1, l.across);
    run = Math.max(run, p.riserFace + (p.ramp - p.riserFace) * climbWeight(p, l.across));
  }
  const reach = p.halfWidth + p.blend;
  if (a1 < -reach || a0 > reach) return false;
  for (let k = 0; k < p.steps.length; k++) {
    const c = riserCentre(p, k);
    if (s1 > c - run / 2 - wallDepth && s0 < c + run / 2) return true;
  }
  return false;
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

/** `x` brought to the copy of the wrapping world nearest `p` (unchanged without a wrap). */
export function nearestCopyX(p: { x: number }, x: number, periodX: number | null): number {
  if (periodX === null || Math.abs(x - p.x) <= periodX / 2) return x;
  return p.x + ((((x - p.x) % periodX) + periodX * 1.5) % periodX) - periodX / 2;
}

/** The plateaus whose reach (plus a pad) may touch a point, found without scanning them all. */
export type PlateauLookup = (x: number, z: number) => readonly TownPlateau[];

/** Grid cell size of `plateauLookup`, world units. */
const LOOKUP_CELL = 1;

/**
 * An index of `plateaus` on a grid of `LOOKUP_CELL` squares: `lookup(x, z)`
 * lists every plateau whose reach plus `pad` may touch (x, z), and only a
 * few others; on a wrapping world in any copy of it.
 */
export function plateauLookup(plateaus: readonly TownPlateau[], periodX: number | null, pad = 0): PlateauLookup {
  const none: readonly TownPlateau[] = [];
  if (plateaus.length === 0) return () => none;
  // Columns of the grid wrap with the world when it has a whole number of cells per period; otherwise x is only folded into one period.
  const columns = periodX === null ? null : Math.max(1, Math.floor(periodX / LOOKUP_CELL));
  const cellWidth = columns === null || periodX === null ? LOOKUP_CELL : periodX / columns;
  const cells = new Map<number, TownPlateau[]>();
  const key = (i: number, j: number) => (columns === null ? i : ((i % columns) + columns) % columns) * 100003 + j;
  for (const p of plateaus) {
    const r = p.reach + pad;
    for (let i = Math.floor((p.x - r) / cellWidth); i <= Math.floor((p.x + r) / cellWidth); i++) {
      for (let j = Math.floor((p.z - r) / LOOKUP_CELL); j <= Math.floor((p.z + r) / LOOKUP_CELL); j++) {
        const k = key(i, j);
        const list = cells.get(k);
        if (!list) cells.set(k, [p]);
        else if (!list.includes(p)) list.push(p);
      }
    }
  }
  return (x, z) => cells.get(key(Math.floor(x / cellWidth), Math.floor(z / LOOKUP_CELL))) ?? none;
}

/**
 * The land height at (x, z) with the plateaus applied to the natural land
 * height `h` (above the shore band only; under it nothing changes).
 * `periodX` wraps the plateaus east–west.
 */
export function applyTownPlateaus(plateaus: readonly TownPlateau[], x: number, z: number, h: number, periodX: number | null): number {
  if (h <= SHORE_KEEP_BOTTOM) return h;
  const keep = shoreKeep(h);
  let out = h;
  for (const p of plateaus) {
    const px = nearestCopyX(p, x, periodX);
    if (Math.abs(px - p.x) > p.reach || Math.abs(z - p.z) > p.reach) continue;
    const w = plateauWeight(p, px, z) * keep;
    if (w <= 0) continue;
    const { s, across } = plateauLocal(p, px, z);
    out += w * (plateauLevel(p, s, across) - out);
    // The streets, carved into the terraces.
    const carve = streetCarveAt(p, px, z);
    if (carve > 0) out -= w * carve * p.carve;
  }
  return out;
}
