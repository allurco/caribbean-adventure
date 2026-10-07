/**
 * Derived ground vegetation (issue #49). Pure, no Three.js.
 *
 * The map generator only emits trees and rocks, so grassland and beaches read
 * as bare between the palms. This derives one to three bush clusters per
 * GRASS cell and one to three dry tufts per SAND cell, placed from a per-cell
 * hash of the cell's coordinates and the map's terrain seed (the
 * `smallStones.ts` pattern), so nothing is stored in G and every client draws
 * the same vegetation. Each shrub stands on the height field, keeps clear of
 * the cell's trees, rocks, stones and pier and of the port marker, and is
 * placed once from its canonical cell: on a wrapping map the world copies
 * redraw the same instances, and the field itself repeats every wrap width.
 */
import { hexToWorld } from "../../game/hex";
import type { Biome, MapCell } from "../../game/types";
import { placeOnGround, type GroundField, type GroundPlacementOptions } from "./groundPlacement";
import { ROCK_UNIT_RADIUS } from "./rockGeometry";
import { ROCK_SIZE_CLASS_SCALE, rockSizeClass } from "./rockVariation";
import { SHRUB_FOOTPRINT_RADIUS, type ShrubKind } from "./shrubGeometry";
import type { ShrubPlacement } from "./shrubVariation";
import type { DecorationData } from "./useDecorationLayout";
import { lerpRange, seedOf, stream } from "./variationStream";
import { PROP_DENSITY, PROP_SCALE } from "./worldScale";
import { PIER_LENGTH, PIER_WIDTH } from "./pierGeometry";
import { QUAY_BACK, QUAY_SEA_FACE, QUAY_WIDTH } from "./quayGeometry";
import type { QuayPlacement } from "./quayPlacement";
import { AGED_BUILDING_HALF_DIAGONAL } from "./agedBuildingGeometry";
import type { PortBuilding } from "./portSettlement";

/** Shrubs per cell, by biome, as an inclusive [min, max]: `PROP_DENSITY` times the authored [1, 3]. */
export const SHRUBS_PER_GRASS_CELL: readonly [number, number] = [1 * PROP_DENSITY, 3 * PROP_DENSITY];
export const SHRUBS_PER_SAND_CELL: readonly [number, number] = [1 * PROP_DENSITY, 3 * PROP_DENSITY];
/** Which kind grows on which biome; ROCK cells stay bare. */
export const SHRUB_KIND_BY_BIOME: Readonly<Record<Biome, ShrubKind | null>> = {
  GRASS: "bush",
  SAND: "tuft",
  ROCK: null,
};
/**
 * Farthest a shrub sits from its cell centre (world units; a hex is 1 unit in
 * radius, 0.87 to an edge). Wider than the stones' 0.55: the generator keeps
 * its trees and rocks within ±0.35 of the centre, so the outer ring is where
 * a grass cell has room left for bushes.
 */
export const SHRUB_SPREAD = 0.68;
/** Placement scale of a shrub, on top of the geometry's unit size, at `PROP_SCALE`. */
export const SHRUB_SCALE_RANGE: readonly [number, number] = [0.8 * PROP_SCALE, 1.3 * PROP_SCALE];
/** Gap kept between a shrub's footprint and a neighbouring prop's. */
export const SHRUB_CLEARANCE = 0.05 * PROP_SCALE;
/** Footprint radius of a tree at scale 1 that shrubs keep out of (the trunk base and its flare). */
export const SHRUB_TREE_RADIUS = 0.06;
/** Radius round a port cell's centre kept free of shrubs: the marker (0.35) plus a margin. */
export const SHRUB_PORT_CLEARANCE = 0.45;
/** Spots tried per shrub before it is given up; each try costs the same stream draws. */
export const SHRUB_ATTEMPTS = 5;
/**
 * Radius of the ground probe at scale 1: the stem or mound base, not the
 * foliage. `placeOnGround` buries a prop to the lowest ground under its probe,
 * and probing the whole foliage radius on a slope sank a bush past its leaves.
 */
export const SHRUB_GROUND_FOOTPRINT = 0.04;
/**
 * Deepest a shrub's base may sit below the ground at its centre, bounding
 * how much of a shrub a slope can hide: half a tuft's height (0.1), and
 * under a bush's foliage blobs (its stem is 0.06 tall). The base rests on
 * the lowest ground probe under it, so on an even hillside it sinks by slope
 * × probe radius plus the sink, and this rejects spots above roughly slope
 * 1.0 at scale 1 down to 0.77 at scale 1.3: tighter than `maxSlope`, on
 * purpose. It also catches a dip under one rim probe (probed all round since
 * #53) that the ±x/±z slope check misses. A spot that would bury the shrub
 * past this is nudged towards the cell centre or given up instead. It
 * shrinks with the shrubs (`PROP_SCALE`).
 */
export const SHRUB_MAX_BURY = 0.05 * PROP_SCALE;

// `maxSlope` is only a coarse first gate for shrubs; `maxBury` is the binding one.
const SHRUB_PLACEMENT: Omit<GroundPlacementOptions, "footprintRadius"> = {
  sink: 0.01 * PROP_SCALE,
  maxSlope: 1.2,
  maxBury: SHRUB_MAX_BURY,
};
const SHRUB_SALT = 0x3e9c57d1;
const TAU = Math.PI * 2;

const SHRUBS_PER_CELL: Readonly<Record<Biome, readonly [number, number]>> = {
  SAND: SHRUBS_PER_SAND_CELL,
  GRASS: SHRUBS_PER_GRASS_CELL,
  ROCK: [0, 0],
};

/** The props already placed on the map that shrubs keep clear of. */
export interface PlacedProps {
  trees: readonly DecorationData[];
  rocks: readonly DecorationData[];
  stones: readonly DecorationData[];
  piers: readonly DecorationData[];
  /** The stone quays at the piers' roots. */
  quays?: readonly QuayPlacement[];
  /** The port buildings, kept clear by their plan circles. */
  buildings?: readonly PortBuilding[];
}

/** A prop's ground footprint: a disc (a == b) or a capsule round the segment a–b. */
export interface ShrubObstacle {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  radius: number;
}

const disc = (d: DecorationData, radius: number): ShrubObstacle => ({
  ax: d.worldX,
  az: d.worldZ,
  bx: d.worldX,
  bz: d.worldZ,
  radius,
});

/**
 * The nominal radius of a rock or stone: unit radius × size class × scale.
 * The drawn rock may be stretched up to 1.3× that, so foliage can brush a
 * long slab; a shrub is never rooted inside one.
 */
const rockRadius = (d: DecorationData, sizeClass = rockSizeClass(d.biome)) =>
  ROCK_UNIT_RADIUS * ROCK_SIZE_CLASS_SCALE[sizeClass] * d.scale;

/** The pier's deck as `Piers.tsx` draws it: from its land end (the placement's origin) out `PIER_LENGTH` along its rotation, at its scale. */
const pierDeck = (d: DecorationData): ShrubObstacle => {
  const length = PIER_LENGTH * d.scale;
  return {
    ax: d.worldX,
    az: d.worldZ,
    bx: d.worldX + Math.sin(d.rotation) * length,
    bz: d.worldZ + Math.cos(d.rotation) * length,
    radius: (PIER_WIDTH / 2) * d.scale,
  };
};

/**
 * The quay's plan, its body from `QUAY_BACK` to `QUAY_SEA_FACE` at its
 * placed size: a capsule along its width through the middle of its depth,
 * as wide as half the depth, which covers the rectangle.
 */
const quayPlan = (q: QuayPlacement): ShrubObstacle => {
  const halfWidth = (QUAY_WIDTH / 2) * q.scaleX;
  const midZ = ((QUAY_BACK + QUAY_SEA_FACE) / 2) * q.scaleZ;
  const cx = q.worldX + midZ * Math.sin(q.yaw);
  const cz = q.worldZ + midZ * Math.cos(q.yaw);
  const ux = Math.cos(q.yaw);
  const uz = -Math.sin(q.yaw);
  return {
    ax: cx - ux * halfWidth,
    az: cz - uz * halfWidth,
    bx: cx + ux * halfWidth,
    bz: cz + uz * halfWidth,
    radius: ((QUAY_SEA_FACE - QUAY_BACK) / 2) * q.scaleZ,
  };
};

const buildingPlan = (b: PortBuilding): ShrubObstacle => ({
  ax: b.worldX,
  az: b.worldZ,
  bx: b.worldX,
  bz: b.worldZ,
  radius: AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale,
});

/** Every placed prop as a footprint shrubs must stay out of. */
export function shrubObstacles(placed: PlacedProps): ShrubObstacle[] {
  return [
    ...placed.trees.map((t) => disc(t, SHRUB_TREE_RADIUS * t.scale)),
    ...placed.rocks.map((r) => disc(r, rockRadius(r))),
    ...placed.stones.map((s) => disc(s, rockRadius(s, "small"))),
    ...placed.piers.map(pierDeck),
    ...(placed.quays ?? []).map(quayPlan),
    ...(placed.buildings ?? []).map(buildingPlan),
  ];
}

/** Distance from (x, z) to the nearest point of the obstacle's segment (its centre line). */
export function segmentDistance(x: number, z: number, o: ShrubObstacle): number {
  const vx = o.bx - o.ax;
  const vz = o.bz - o.az;
  const len2 = vx * vx + vz * vz;
  const t = len2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((x - o.ax) * vx + (z - o.az) * vz) / len2));
  return Math.hypot(x - (o.ax + vx * t), z - (o.az + vz * t));
}

const clear = (x: number, z: number, radius: number, obstacles: readonly ShrubObstacle[]): boolean =>
  obstacles.every((o) => segmentDistance(x, z, o) >= o.radius + radius + SHRUB_CLEARANCE);

/** How far from a cell centre an obstacle can still touch that cell's shrubs. */
const obstacleReach = (o: ShrubObstacle) =>
  o.radius + SHRUB_SPREAD + SHRUB_FOOTPRINT_RADIUS.bush * SHRUB_SCALE_RANGE[1] + SHRUB_CLEARANCE;

/** The shrubs for every sand or grass cell, on the ground; `seed` is the map's terrain seed. */
export function placeShrubs(
  cells: readonly MapCell[],
  field: GroundField,
  seed: number,
  placed: PlacedProps
): ShrubPlacement[] {
  const obstacles = shrubObstacles(placed);
  const shrubs: ShrubPlacement[] = [];

  for (const cell of cells) {
    if (cell.terrain !== "island" || !cell.biome) continue;
    const kind = SHRUB_KIND_BY_BIOME[cell.biome];
    if (!kind) continue;
    const [min, max] = SHRUBS_PER_CELL[cell.biome];

    const [hexX, , hexZ] = hexToWorld(cell.hex);
    const anchor = { x: hexX, z: hexZ };
    // The seed goes in through the salt: seedOf quantises its values by 4096 (a
    // 12-bit shift into int32), which would drop a 32-bit seed's top 12 bits.
    const next = stream(seedOf([cell.hex.q, cell.hex.r], SHRUB_SALT ^ seed));
    const count = min + Math.floor(next() * (max - min + 1));

    // Only this cell's props can touch its shrubs; neighbours' props are too far.
    const nearby = obstacles.filter((o) => segmentDistance(hexX, hexZ, o) <= obstacleReach(o));
    const placedHere: ShrubObstacle[] = [];

    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < SHRUB_ATTEMPTS; attempt++) {
        const angle = next() * TAU;
        const distance = Math.sqrt(next()) * SHRUB_SPREAD;
        const rotation = next() * TAU;
        const scale = lerpRange(SHRUB_SCALE_RANGE, next());
        const radius = SHRUB_FOOTPRINT_RADIUS[kind] * scale;
        const spot = { x: hexX + Math.cos(angle) * distance, z: hexZ + Math.sin(angle) * distance };
        const ground = placeOnGround(field, spot, anchor, {
          ...SHRUB_PLACEMENT,
          footprintRadius: SHRUB_GROUND_FOOTPRINT * scale,
        });
        if (!ground) continue;
        // The nudge may have pulled the spot towards the centre, so test where it landed.
        if (cell.hasPort && Math.hypot(ground.x - hexX, ground.z - hexZ) < SHRUB_PORT_CLEARANCE + radius) continue;
        if (!clear(ground.x, ground.z, radius, nearby)) continue;
        // Other shrubs of this cell may touch but not overlap.
        if (!placedHere.every((o) => segmentDistance(ground.x, ground.z, o) >= o.radius + radius)) continue;

        shrubs.push({ kind, worldX: ground.x, worldY: ground.y, worldZ: ground.z, rotation, scale });
        placedHere.push({ ax: ground.x, az: ground.z, bx: ground.x, bz: ground.z, radius });
        break;
      }
    }
  }
  return shrubs;
}
