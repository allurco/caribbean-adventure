/**
 * The town's ground works and clutter (#87). Pure, no Three.js.
 *
 * Works, built straight into world space (`townWorks`):
 * - Dry-stone retaining walls on every riser face of a town plateau, from
 *   the lower terrace's ground (and a footing under it) to a coping course
 *   just over the upper terrace, battered back a little, faced with
 *   irregular stones whose joints show dark, broken where a street climbs
 *   the riser. Their height follows the ground, so they fade out with the
 *   plateau into the hillside.
 * - Kerb stones along both edges of the main street, standing a hand proud
 *   of the street's carved bed, broken at the lanes that cross it; sparse
 *   edge stones along the lanes.
 *
 * Pieces, placed for `townPieces.ts` models (`townClutter`): a fountain on
 * the square; market stalls round it; a cart or two parked at its edge;
 * cargo stacked against the warehouses' sides and the odd barrel or crate
 * against a house; fishing boats pulled up on the beach with net racks
 * behind them; fenced gardens behind houses; a few palms. Nothing on a
 * street's running surface, on the quay or the pier, on another piece or
 * inside a building's footprint (a piece against a building's wall stands
 * under its eaves).
 */
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { GroundField } from "./groundPlacement";
import type { Rgb } from "./palmGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { seedOf, stream } from "./variationStream";
import {
  climbWeight,
  crossesRiser,
  KERB_WIDTH,
  nearestCopyX,
  plateauPlanDistance,
  plateauPoint,
  RETAINING_WALL_DEPTH,
  riserCentre,
  streetDistance,
  type TownPlateau,
} from "./townPlateau";
import { TOWN_PIECE_RADIUS, TOWN_PIECE_VARIANTS, type TownPieceKind } from "./townPieces";
import { VILLAGE_EAVE, VILLAGE_PLAN } from "./villageBuildingGeometry";
import { overlaps, pierRect, polylineDistance, quayRect, type PlanRect, type PortTownPlan } from "./villageLayout";

/** At the building scale: the wall's batter per unit of height, the coping's rise over the upper terrace, the footing under the lower. */
const WALL_BATTER = 0.12;
const WALL_COPING = 0.004;
const WALL_FOOTING = 0.012;
/** A wall segment's length along the riser, the least height worth a wall, and a facing stone's height and the joint between stones (building scale). */
const WALL_SEGMENT = 0.04;
const WALL_MIN_HEIGHT = 0.008;
const WALL_STONE = 0.011;
const WALL_JOINT = 0.0014;
/** How far along a riser the walls run past the terraces' width, as a share of the blend. */
const WALL_REACH = 0.6;
/** At the building scale: a kerb stone's length, the gap between kerbs, how proud it stands of the terrace (its width is `KERB_WIDTH`). */
const KERB_LENGTH = 0.016;
const KERB_GAP = 0.0015;
const KERB_PROUD = 0.0025;
/** Edge stones along the lanes: spacing, size, how many are left out. */
const EDGE_STONE_SPACING = 0.045;
const EDGE_STONE_SIZE = 0.007;
const EDGE_STONE_SKIP = 0.4;
/** A garden's half extents at scale 1 (its fence's outline, `townPieces.ts`). */
const GARDEN_HALF: readonly [number, number] = [0.062, 0.052];

export interface TownWorksColors {
  /** The walls' facing stone, the dark joints between, the coping. */
  wallStone: Rgb;
  joint: Rgb;
  coping: Rgb;
  kerb: Rgb;
}

/** A piece of the town's clutter at its place. */
export interface PiecePlacement {
  kind: TownPieceKind;
  variant: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

/** A box in world space: centre (x, z), unit `along` direction in plan, half extents along and across, from y0 to y1; no bottom face. */
function orientedBox(b: FacetBuilder, x: number, z: number, ax: number, az: number, halfL: number, halfW: number, y0: number, y1: number, color: Rgb, topColor = color) {
  const cx = -az;
  const cz = ax;
  const at = (l: number, w: number, y: number): Vec3 => [x + ax * l + cx * w, y, z + az * l + cz * w];
  const centre: Vec3 = [x, (y0 + y1) / 2, z];
  const corners: [number, number][] = [
    [-halfL, -halfW],
    [halfL, -halfW],
    [halfL, halfW],
    [-halfL, halfW],
  ];
  for (let k = 0; k < 4; k++) {
    const [l0, w0] = corners[k];
    const [l1, w1] = corners[(k + 1) % 4];
    b.outwardQuad(at(l0, w0, y0), at(l1, w1, y0), at(l1, w1, y1), at(l0, w0, y1), centre, color);
  }
  b.outwardQuad(at(-halfL, -halfW, y1), at(halfL, -halfW, y1), at(halfL, halfW, y1), at(-halfL, halfW, y1), centre, topColor);
}

/** The retaining walls of one plateau's risers, at building scale `k`. */
function retainingWalls(b: FacetBuilder, p: TownPlateau, ground: GroundField, k: number, colors: TownWorksColors) {
  const depth = RETAINING_WALL_DEPTH * k;
  const segment = WALL_SEGMENT * k;
  const reach = p.halfWidth + p.blend * WALL_REACH;
  const at = (s: number, a: number, y: number): Vec3 => {
    const [x, z] = plateauPoint(p, s, a);
    return [x, y, z];
  };
  for (let r = 0; r < p.steps.length; r++) {
    const c = riserCentre(p, r);
    const sFoot = c - p.riserFace / 2 - depth;
    const sBack = c + p.riserFace / 2 + 0.0005;
    for (let a0 = -reach; a0 < reach - 1e-9; a0 += segment) {
      const a1 = Math.min(reach, a0 + segment);
      const am = (a0 + a1) / 2;
      // Broken where a street climbs the riser (the ramp).
      if (climbWeight(p, a0) > 0.02 || climbWeight(p, a1) > 0.02) continue;
      const lowerAt = (a: number) => ground.sampleHeight(...plateauPoint(p, sFoot - 0.003, a));
      const upperAt = (a: number) => ground.sampleHeight(...plateauPoint(p, sBack + 0.003, a));
      const lower = Math.min(lowerAt(a0), lowerAt(a1));
      const upper = Math.max(upperAt(a0), upperAt(a1));
      const height = upper - lower;
      if (height < WALL_MIN_HEIGHT * k) continue;
      // A wall holds a terrace, not a hillside: where the plateau has faded into a steep slope, none.
      if (height > (p.levels[r + 1] - p.levels[r]) * 1.5) continue;
      const bottom = lower - WALL_FOOTING * k;
      const top = upper + WALL_COPING * k;
      // The battered face: at height y it stands back from the foot by the batter.
      const faceS = (y: number) => sFoot + Math.max(0, y - lower) * WALL_BATTER;
      const centre = at((sFoot + sBack) / 2, am, (bottom + top) / 2);
      // The body: its face (the dark joints), the ends, the back over the upper terrace, the coping on top.
      b.outwardQuad(at(faceS(bottom), a0, bottom), at(faceS(bottom), a1, bottom), at(faceS(top), a1, top), at(faceS(top), a0, top), centre, colors.joint);
      b.outwardQuad(at(faceS(bottom), a0, bottom), at(sBack, a0, bottom), at(sBack, a0, top), at(faceS(top), a0, top), centre, colors.wallStone);
      b.outwardQuad(at(faceS(bottom), a1, bottom), at(sBack, a1, bottom), at(sBack, a1, top), at(faceS(top), a1, top), centre, colors.wallStone);
      b.outwardQuad(at(sBack, a0, bottom), at(sBack, a1, bottom), at(sBack, a1, top), at(sBack, a0, top), centre, colors.wallStone);
      b.outwardQuad(at(faceS(top), a0, top), at(faceS(top), a1, top), at(sBack, a1, top), at(sBack, a0, top), centre, colors.coping);
      // The facing: irregular stones in courses, a hair proud of the face, from the ground up.
      const next = stream(seedOf([Math.round(a0 * 1e4), r], 0x5703));
      let y = Math.max(bottom, lower - WALL_STONE * k * 0.5);
      let course = 0;
      while (y < top - WALL_JOINT * k) {
        const h = Math.min(top - y, WALL_STONE * k * (0.75 + next() * 0.5));
        const y0 = y + WALL_JOINT * k * 0.5;
        const y1 = y + h - WALL_JOINT * k * 0.5;
        let a = a0 + (course % 2 === 1 ? segment * 0.25 * next() : 0);
        // The course's first stone starts at the segment's start.
        if (a > a0) a = a0;
        while (a < a1 - 1e-9) {
          const w = Math.min(a1 - a, segment * (0.3 + next() * 0.35));
          const s0 = a + WALL_JOINT * k * 0.5;
          const s1 = a + w - WALL_JOINT * k * 0.5;
          if (s1 > s0) {
            const proud = 0.0003 + next() * 0.0004;
            const tone = shadeRgb(colors.wallStone, 0.78 + next() * 0.4);
            b.outwardQuad(at(faceS(y0) - proud, s0, y0), at(faceS(y0) - proud, s1, y0), at(faceS(y1) - proud, s1, y1), at(faceS(y1) - proud, s0, y1), centre, tone);
          }
          a += w;
        }
        y += h;
        course++;
      }
    }
  }
}

/** Kerbs along the main street's edges and edge stones along the lanes, at building scale `k`. */
function streetEdges(b: FacetBuilder, p: TownPlateau, ground: GroundField, k: number, colors: TownWorksColors) {
  const kerbW = KERB_WIDTH * k;
  for (const street of p.streets) {
    const [x0, z0] = street.from;
    const [x1, z1] = street.to;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const tx = (x1 - x0) / len;
    const tz = (z1 - z0) / len;
    const nx = -tz;
    const nz = tx;
    const others = p.streets.filter((s) => s !== street);
    const next = stream(seedOf([Math.round(x0 * 1e3), Math.round(z0 * 1e3)], 0x4e2b));
    for (const side of [-1, 1]) {
      if (street.kind === "main") {
        // The kerb starts where the square's paving ends.
        const start = Math.max(0, p.squareRadius * 0.55 - Math.hypot(x0 - p.x, z0 - p.z));
        const stone = KERB_LENGTH * k;
        for (let t = start; t + stone < len; t += stone + KERB_GAP * k) {
          const d = street.halfWidth - kerbW / 2;
          const x = x0 + tx * (t + stone / 2) + nx * side * d;
          const z = z0 + tz * (t + stone / 2) + nz * side * d;
          if (others.some((o) => streetDistance(o, x, z) < o.halfWidth + kerbW)) continue;
          const outside = ground.sampleHeight(x + nx * side * kerbW, z + nz * side * kerbW);
          const inside = ground.sampleHeight(x - nx * side * kerbW, z - nz * side * kerbW);
          const tone = shadeRgb(colors.kerb, 0.85 + next() * 0.3);
          orientedBox(b, x, z, tx, tz, stone / 2, kerbW / 2, Math.min(inside, outside) - kerbW, outside + KERB_PROUD * k, tone, shadeRgb(tone, 1.12));
        }
      } else {
        for (let t = EDGE_STONE_SPACING * k * next(); t < len; t += EDGE_STONE_SPACING * k * (0.6 + next() * 0.8)) {
          if (next() < EDGE_STONE_SKIP) continue;
          const d = street.halfWidth + EDGE_STONE_SIZE * k * 0.3;
          const x = x0 + tx * t + nx * side * d;
          const z = z0 + tz * t + nz * side * d;
          if (others.some((o) => streetDistance(o, x, z) < o.halfWidth + EDGE_STONE_SIZE * k)) continue;
          const g = ground.sampleHeight(x, z);
          const size = EDGE_STONE_SIZE * k * (0.7 + next() * 0.6);
          const yaw = next() * Math.PI;
          orientedBox(b, x, z, Math.sin(yaw), Math.cos(yaw), size / 2, size * 0.4, g - size * 0.5, g + size * 0.35, shadeRgb(colors.kerb, 0.75 + next() * 0.35));
        }
      }
    }
  }
}

/** The retaining walls, kerbs and edge stones of every port's plateau, in world space, at building scale `k`. */
export function townWorks(plans: readonly PortTownPlan[], ground: GroundField, k: number, colors: TownWorksColors): FacetGeometryData {
  const b = createFacetBuilder();
  for (const plan of plans) {
    retainingWalls(b, plan.plateau, ground, k, colors);
    streetEdges(b, plan.plateau, ground, k, colors);
  }
  return b.build();
}

/** Whether a circle at (x, z) of radius r touches a rectangle. */
export function circleHitsRect(f: PlanRect, x: number, z: number, r: number): boolean {
  const dx = x - f.x;
  const dz = z - f.z;
  const along = Math.abs(dx * f.fx + dz * f.fz);
  const across = Math.abs(-dx * f.fz + dz * f.fx);
  const ox = Math.max(0, across - f.halfW);
  const oz = Math.max(0, along - f.halfD);
  return Math.hypot(ox, oz) < r;
}

/** Clutter targets per port. */
const STALLS: readonly [number, number] = [2, 4];
const CARTS: readonly [number, number] = [1, 2];
const BOATS: readonly [number, number] = [2, 4];
const GARDENS: readonly [number, number] = [3, 6];
const PALMS: readonly [number, number] = [2, 4];
const HOUSE_CLUTTER_CHANCE = 0.35;
/** The beach a boat is pulled up on: this far above the sea, and how far from the hex centre to look. */
const BOAT_BEACH: readonly [number, number] = [SEA_LEVEL + 0.002, SEA_LEVEL + 0.012];
const BOAT_RING: readonly [number, number] = [0.25, 0.8];
const BOAT_GAP = 0.02;
/** Pieces stay this close to their port's hex centre. */
const CLUTTER_REACH = 0.85;
/** A palm's trunk, at scale 1: what keeps it off streets and walls (its crown may overhang them). */
const PALM_TRUNK = 0.012;
/** Clear margin kept round the quay and the pier deck. */
const QUAY_CLEARANCE = 0.02;
/** Most the ground may fall under a piece's footprint: this much at the building scale, or this slope across its radius if more. */
const PIECE_MAX_SPREAD = 0.01;
const PIECE_MAX_SLOPE = 0.8;

/** Clutter for every port's village, at building scale `k`; `seed` varies it per map. */
export function townClutter(plans: readonly PortTownPlan[], ground: GroundField, k: number, seed: number): PiecePlacement[] {
  const out: PiecePlacement[] = [];
  for (const plan of plans) out.push(...portClutter(plan, ground, k, seed));
  return out;
}

/** The radius a placed piece keeps clear: a palm's trunk, every other piece's footprint. */
export const pieceClearRadius = (piece: PiecePlacement): number => (piece.kind === "palm" ? PALM_TRUNK : TOWN_PIECE_RADIUS[piece.kind]) * piece.scale;

function portClutter(plan: PortTownPlan, ground: GroundField, k: number, seed: number): PiecePlacement[] {
  const next = stream(seedOf([Math.round(plan.cx * 100), Math.round(plan.cz * 100)], 0x6c7e ^ seed));
  const pieces: PiecePlacement[] = [];
  const radius = (kind: TownPieceKind) => TOWN_PIECE_RADIUS[kind] * k;
  const harbour = [pierRect(plan.pier), ...plan.quays.map(quayRect)];
  const onHarbour = (x: number, z: number, r: number) => harbour.some((h) => circleHitsRect(h, x, z, r + QUAY_CLEARANCE));
  /** Whether a piece of `kind` may stand at (x, z); `owner` is a building it may stand against (under its eaves). */
  const clear = (kind: TownPieceKind, x: number, z: number, owner?: PlanRect, trunkOnly = false): boolean => {
    const r = trunkOnly ? PALM_TRUNK * k : radius(kind);
    if (Math.hypot(x - plan.cx, z - plan.cz) > CLUTTER_REACH) return false;
    if (plan.streets.some((s) => polylineDistance(x, z, s.line) < s.halfWidth + r)) return false;
    if (onHarbour(x, z, r)) return false;
    if (plan.footprints.some((f) => f !== owner && circleHitsRect(f, x, z, r))) return false;
    if (pieces.some((q) => Math.hypot(q.x - x, q.z - z) < r + pieceClearRadius(q) * 0.9)) return false;
    // No piece (a palm by its trunk) straddles a riser or its wall, or stands on a bank steeper than it can sit on.
    if (crossesRiser(plan.plateau, squareAround(x, z, r), RETAINING_WALL_DEPTH * k)) return false;
    if (groundSpread(ground, x, z, r) > Math.max(PIECE_MAX_SPREAD * k, r * PIECE_MAX_SLOPE)) return false;
    return ground.sampleHeight(x, z) > SEA_LEVEL + 0.003;
  };
  /** The ground under a piece: the lowest of its centre and a ring, so nothing floats. */
  const groundUnder = (x: number, z: number, r: number) => {
    let h = ground.sampleHeight(x, z);
    for (let a = 0; a < 4; a++) h = Math.min(h, ground.sampleHeight(x + Math.cos(a * 1.57) * r, z + Math.sin(a * 1.57) * r));
    return h;
  };
  const put = (kind: TownPieceKind, x: number, z: number, yaw: number, sink = 0.5) => {
    const r = radius(kind) * sink;
    pieces.push({ kind, variant: Math.floor(next() * TOWN_PIECE_VARIANTS[kind]), x, y: groundUnder(x, z, r), z, yaw, scale: k });
  };
  const roll = ([lo, hi]: readonly [number, number]) => lo + Math.floor(next() * (hi - lo + 1));
  const p = plan.plateau;
  const sq = { x: p.x, z: p.z };
  const squareR = p.squareRadius;

  // The fountain at the square's middle, or the nearest clear spot to it.
  search: for (let rr = 0; rr <= squareR * 0.5; rr += squareR * 0.08) {
    for (let a = 0; a < Math.PI * 2; a += rr === 0 ? 7 : 0.5) {
      const x = sq.x + Math.sin(a) * rr;
      const z = sq.z + Math.cos(a) * rr;
      if (clear("fountain", x, z)) {
        put("fountain", x, z, 0, 0.8);
        break search;
      }
    }
  }

  // Market stalls round the square, facing its middle.
  const stalls = roll(STALLS);
  let placedStalls = 0;
  for (let i = 0; i < 40 && placedStalls < stalls; i++) {
    const a = next() * Math.PI * 2;
    const rr = squareR * (0.35 + next() * 0.4);
    const x = sq.x + Math.sin(a) * rr;
    const z = sq.z + Math.cos(a) * rr;
    if (!clear("stall", x, z)) continue;
    put("stall", x, z, a + Math.PI);
    placedStalls++;
  }

  // A cart or two parked at the square's edge, along it.
  const carts = roll(CARTS);
  let placedCarts = 0;
  for (let i = 0; i < 40 && placedCarts < carts; i++) {
    const a = next() * Math.PI * 2;
    const rr = squareR * (0.6 + next() * 0.5);
    const x = sq.x + Math.sin(a) * rr;
    const z = sq.z + Math.cos(a) * rr;
    if (!clear("cart", x, z)) continue;
    put("cart", x, z, a + Math.PI / 2 + (next() - 0.5) * 0.6);
    placedCarts++;
  }

  // Cargo against the warehouses' side walls; a barrel or crate against some houses.
  plan.buildings.forEach((building, i) => {
    const owner = plan.footprints.find((f) => Math.abs(f.x - building.worldX) < 1e-9 && Math.abs(f.z - building.worldZ) < 1e-9);
    const wall = VILLAGE_PLAN[building.variant];
    const rx = Math.cos(building.yaw);
    const rz = -Math.sin(building.yaw);
    const fx = Math.sin(building.yaw);
    const fz = Math.cos(building.yaw);
    const spots: { kind: TownPieceKind; side: number; along: number }[] = [];
    if (building.variant === "warehouse") {
      for (const side of [-1, 1]) for (const along of [-0.5, 0.05, 0.55]) if (next() < 0.7) spots.push({ kind: (["crateStack", "barrel", "crate", "barrel"] as const)[Math.floor(next() * 4)], side, along });
    } else if (building.variant !== "leanTo" && next() < HOUSE_CLUTTER_CHANCE) {
      spots.push({ kind: next() < 0.6 ? "barrel" : "crate", side: next() < 0.5 ? -1 : 1, along: 0.6 });
    }
    for (const s of spots) {
      const r = radius(s.kind);
      const across = wall.halfW * building.scale + r * 1.05;
      const along = s.along * wall.halfD * building.scale;
      const x = building.worldX + rx * across * s.side + fx * along;
      const z = building.worldZ + rz * across * s.side + fz * along;
      if (clear(s.kind, x, z, owner)) put(s.kind, x, z, building.yaw + (next() - 0.5) * 0.8 + i);
    }
  });

  // Fishing boats pulled up on the beach, bow uphill, and net racks above them.
  const boats = roll(BOATS);
  let placedBoats = 0;
  for (let i = 0; i < 300 && placedBoats < boats; i++) {
    const a = next() * Math.PI * 2;
    const rr = BOAT_RING[0] + next() * (BOAT_RING[1] - BOAT_RING[0]);
    const x = plan.cx + Math.sin(a) * rr;
    const z = plan.cz + Math.cos(a) * rr;
    const h = ground.sampleHeight(x, z);
    if (h < BOAT_BEACH[0] || h > BOAT_BEACH[1]) continue;
    if (pieces.some((q) => q.kind === "boat" && Math.hypot(q.x - x, q.z - z) < radius("boat") * 2 + BOAT_GAP)) continue;
    if (!clear("boat", x, z)) continue;
    const e = 0.01;
    const gx = ground.sampleHeight(x + e, z) - ground.sampleHeight(x - e, z);
    const gz = ground.sampleHeight(x, z + e) - ground.sampleHeight(x, z - e);
    if (Math.hypot(gx, gz) < 1e-6) continue;
    const yaw = Math.atan2(gx, gz) + (next() - 0.5) * 0.5;
    put("boat", x, z, yaw, 0.3);
    placedBoats++;
    // A net rack a little up the beach, along it.
    if (next() < 0.7) {
      const up = radius("boat") + radius("netRack") + 0.004;
      const nx2 = x + Math.sin(yaw) * up;
      const nz2 = z + Math.cos(yaw) * up;
      if (clear("netRack", nx2, nz2)) put("netRack", nx2, nz2, yaw + Math.PI / 2);
    }
  }

  // Fenced gardens behind or beside cottages and stone houses, square to them.
  const gardens = roll(GARDENS);
  let placedGardens = 0;
  const gardenHalf = { w: GARDEN_HALF[0] * k, d: GARDEN_HALF[1] * k };
  for (const building of plan.buildings) {
    if (placedGardens >= gardens) break;
    if (building.variant !== "cottage" && building.variant !== "stoneHouse") continue;
    const wall = VILLAGE_PLAN[building.variant];
    const fx = Math.sin(building.yaw);
    const fz = Math.cos(building.yaw);
    const rx = Math.cos(building.yaw);
    const rz = -Math.sin(building.yaw);
    // Clear of the house's own footprint (its eaves) by a hand.
    const eave = VILLAGE_EAVE[building.variant] * building.scale + 0.006 * k;
    const back = wall.halfD * building.scale + eave + gardenHalf.d;
    const side = wall.halfW * building.scale + eave + gardenHalf.w;
    for (const [ox, oz] of [
      [-fx * back, -fz * back],
      [rx * side, rz * side],
      [-rx * side, -rz * side],
    ]) {
      const x = building.worldX + ox;
      const z = building.worldZ + oz;
      const foot: PlanRect = { x, z, fx, fz, halfW: gardenHalf.w, halfD: gardenHalf.d };
      if (plan.footprints.some((f) => overlaps(f, foot, 0.002))) continue;
      if (plan.streets.some((s) => polylineDistance(x, z, s.line) < s.halfWidth + gardenHalf.w)) continue;
      if (pieces.some((q) => Math.hypot(q.x - x, q.z - z) < pieceClearRadius(q) + gardenHalf.w)) continue;
      if (onHarbour(x, z, Math.hypot(gardenHalf.w, gardenHalf.d))) continue;
      if (Math.hypot(x - plan.cx, z - plan.cz) > CLUTTER_REACH) continue;
      if (groundSpread(ground, x, z, gardenHalf.w) > 0.004) continue;
      if (ground.sampleHeight(x, z) < SEA_LEVEL + 0.006) continue;
      if (crossesRiser(plan.plateau, squareAround(x, z, Math.hypot(gardenHalf.w, gardenHalf.d)), RETAINING_WALL_DEPTH * k)) continue;
      put("garden", x, z, building.yaw, 0.6);
      placedGardens++;
      break;
    }
  }

  // A few palms in the town: on the square's edge, in yards.
  const palms = roll(PALMS);
  let placedPalms = 0;
  for (let i = 0; i < 200 && placedPalms < palms; i++) {
    const a = next() * Math.PI * 2;
    const rr = squareR * (0.5 + next() * 2.2);
    const x = sq.x + Math.sin(a) * rr;
    const z = sq.z + Math.cos(a) * rr;
    if (!clear("palm", x, z, undefined, true)) continue;
    // The crown keeps off the roofs.
    if (plan.footprints.some((f) => circleHitsRect(f, x, z, radius("palm") * 0.45))) continue;
    put("palm", x, z, next() * Math.PI * 2, 0.1);
    placedPalms++;
  }
  return pieces;
}

/** Props keep this far outside a town plateau's plan (its streets, terraces and walls). */
export const TOWN_CLEAR_MARGIN = 0.02;

/**
 * Whether a prop of radius `r` at (x, z) would stand in a town: inside a
 * plateau's plan (with `TOWN_CLEAR_MARGIN`), on any rectangle a port's plan
 * took (village, kit, quay, pier) or on a piece of its clutter. Trees,
 * rocks, stones, shrubs and boulders are dropped where it holds, so they
 * stay out of the town's plan. `periodX` wraps the world east–west.
 */
export function townKeepOut(plans: readonly PortTownPlan[], clutter: readonly PiecePlacement[], periodX: number | null): (x: number, z: number, r: number) => boolean {
  return (x, z, r) => {
    for (const plan of plans) {
      const px = nearestCopyX(plan.plateau, x, periodX);
      if (Math.abs(px - plan.plateau.x) > plan.plateau.reach + r || Math.abs(z - plan.plateau.z) > plan.plateau.reach + r) continue;
      if (plateauPlanDistance(plan.plateau, px, z) < TOWN_CLEAR_MARGIN + r) return true;
      if (plan.footprints.some((f) => circleHitsRect(f, px, z, r))) return true;
      if (clutter.some((c) => Math.hypot(c.x - px, c.z - z) < pieceClearRadius(c) + r)) return true;
    }
    return false;
  };
}

/** The corners of the square of half size `r` round (x, z). */
const squareAround = (x: number, z: number, r: number): [number, number][] => [
  [x - r, z - r],
  [x + r, z - r],
  [x + r, z + r],
  [x - r, z + r],
];

function groundSpread(ground: GroundField, x: number, z: number, r: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [dx, dz] of [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    const h = ground.sampleHeight(x + dx, z + dz);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi - lo;
}
