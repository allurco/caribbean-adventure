/**
 * The #83/#84 prototypes' packed port town (throwaway): the aged kit's house
 * and warehouse, at the #84 prop scale, packed as tightly as they fit on
 * every port hex. Pure, no Three.js; `HouseScaleBoxes.tsx` draws them with
 * the port kit's own instanced meshes.
 *
 * Rows run parallel to the beach from the water side inland, a lane
 * between rows and a cross street every few buildings. Along a row each
 * building takes its own plan (walls plus the eaves' overhang and lean),
 * so a warehouse takes a warehouse's room. Near the shore about one in
 * four is a warehouse; the rest are houses, which thin out inland. Each
 * building faces the water or turns its back or side to it, with a small
 * yaw jitter, a scale within the kit's range and a tint, so the rows do
 * not read as clones. Nothing stands inside the hex's edge band, on wet or
 * uneven ground (more than the footing covers), on the quay, at the pier
 * root, or within a margin of the port's own buildings (a wider one round
 * the tower, church and tavern, so the civic kit stays clear).
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors, canonicalHex, type MapWrap } from "../../game/hex";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { BUILDING_FOOTING, type BuildingKind } from "./buildingGeometry";
import type { GroundField } from "./groundPlacement";
import {
  PORT_BUILDING_SCALE_RANGE,
  PORT_BUILDING_TINT_SPREAD,
  buildingGroundY,
  buildingMaxSpread,
  type PortBuilding,
} from "./portSettlement";
import { quayTopAt, type QuayPlacement } from "./quayPlacement";
import { PIER_WIDTH } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { PROP_SCALE } from "./propScale";
import { lerpRange, seedOf, stream } from "./variationStream";

const K = PROP_SCALE;
/** Past the walls on every side: the roof's overhang plus the lean, at scale 1. */
const EAVE_MARGIN = 0.035;
const MAX_SCALE = PORT_BUILDING_SCALE_RANGE[1];
/** A row is as deep as the deepest footprint across it (a warehouse front-on, or a house side-on), plus a lane. */
const ROW_HALF_DEPTH = (AGED_BUILDING_PLAN.house.halfW + EAVE_MARGIN) * MAX_SCALE * K;
const LANE = 0.05 * K;
const ROW_PITCH = 2 * ROW_HALF_DEPTH + LANE;
/** Between neighbours along a row (eaves nearly touching), and a cross street every `STREET_EVERY` range of buildings. */
const PARTY_GAP = 0.008 * K;
const STREET = 0.07 * K;
const STREET_EVERY: readonly [number, number] = [4, 8];
/** Step along a row after a spot is refused. */
const SKIP = 0.03 * K;
/** Metres a world unit stands for at the prop scale: the town's bands are set in metres. */
const PROP_METRES_PER_UNIT = 65 / K;
/** Within this many metres of the water a building may be a warehouse (`WAREHOUSE_SHARE` of them). */
const WATERFRONT_METRES = 100;
const WAREHOUSE_SHARE = 0.25;
/** Full rows within this many metres of the water; past it the town thins to `FAR_KEEP` over `THINNING_METRES`. */
const FULL_TOWN_METRES = 120;
const THINNING_METRES = 600;
const FAR_KEEP = 0.12;
/** How far inland the shore is looked for, and in what steps (world units). */
const SHORE_SEARCH = 1.8;
const SHORE_STEP = 0.02;
const DRY_HEIGHT = SEA_LEVEL + 0.02 * K;
/** Clear margin round the port's own buildings: wide round the civic kit, narrower round its house and warehouse. */
const CIVIC_MARGIN = 0.1 * K;
const KIT_MARGIN = 0.04 * K;
const YAW_JITTER = 0.05;
const SALT = 0x2c6e9b13;
const SQRT3 = Math.sqrt(3);

/** Turns from facing the water, in quarter turns, with their weights: mostly front-on, some backs and sides. */
const HOUSE_TURNS: readonly [number, number][] = [
  [0, 0.5],
  [2, 0.2],
  [1, 0.15],
  [3, 0.15],
];

/** What the town keeps clear of: the settlement as `decorationLayout` placed it. */
export interface PortKit {
  buildings: readonly PortBuilding[];
  quays: readonly QuayPlacement[];
  /** The piers' land ends. */
  piers: readonly { worldX: number; worldZ: number }[];
}

const pickTurn = (roll: number): number => {
  let acc = 0;
  for (const [turn, weight] of HOUSE_TURNS) {
    acc += weight;
    if (roll < acc) return turn;
  }
  return 0;
};

/** The town on every port hex, standing on `ground`; `seed` is the terrain seed. */
export function portTown(cells: readonly MapCell[], ground: GroundField, wrap: MapWrap, kit: PortKit, seed = 0): PortBuilding[] {
  const water = new Set<string>();
  for (const cell of cells) if (cell.terrain !== "island") water.add(`${cell.hex.q},${cell.hex.r}`);
  const town: PortBuilding[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [cx, , cz] = hexToWorld(cell.hex);
    const near = <T extends { worldX: number; worldZ: number }>(items: readonly T[]) =>
      items.filter((i) => Math.hypot(i.worldX - cx, i.worldZ - cz) < 1);
    const kitHere = near(kit.buildings);
    const quays = near(kit.quays);
    const piers = near(kit.piers);

    // Towards the water: the mean direction to the water neighbours.
    let dx = 0;
    let dz = 0;
    const edgeNormals: [number, number][] = [];
    for (const n of neighbors(cell.hex)) {
      const [nx, , nz] = hexToWorld(n);
      edgeNormals.push([(nx - cx) / SQRT3, (nz - cz) / SQRT3]);
      const c = canonicalHex(n, wrap);
      if (!water.has(`${c.q},${c.r}`)) continue;
      dx += nx - cx;
      dz += nz - cz;
    }
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    dx /= len;
    dz /= len;
    // Along the row: perpendicular to the water direction.
    const ax = -dz;
    const az = dx;
    const facingWater = Math.atan2(dx, dz);
    const next = stream(seedOf([cell.hex.q, cell.hex.r], SALT ^ seed));

    const inHex = (x: number, z: number, reach: number) =>
      edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - reach);
    /** Metres from (x, z) to the water, straight towards it (the search's end if none). */
    const toShore = (x: number, z: number) => {
      for (let d = 0; d <= SHORE_SEARCH; d += SHORE_STEP) {
        if (ground.sampleHeight(x + dx * d, z + dz * d) <= SEA_LEVEL) return d * PROP_METRES_PER_UNIT;
      }
      return SHORE_SEARCH * PROP_METRES_PER_UNIT;
    };

    const rows = Math.floor(SQRT3 / ROW_PITCH);
    for (let row = 0; row <= rows; row++) {
      const t = SQRT3 / 2 - ROW_HALF_DEPTH - row * ROW_PITCH;
      let s = -SQRT3 / 2;
      let sinceStreet = 0;
      let streetAt = Math.round(lerpRange(STREET_EVERY, next()));
      while (s < SQRT3 / 2) {
        // Every candidate draws the same numbers, placed or not.
        const kindRoll = next();
        const turnRoll = next();
        const scaleRoll = next();
        const tintRoll = next();
        const jitterRoll = next();
        const keepRoll = next();

        const rx = cx + dx * t + ax * s;
        const rz = cz + dz * t + az * s;
        const inland = toShore(rx, rz);
        /** Places `kind` with its near end at `s`; returns the far end along the row, or false. */
        const tryKind = (kind: BuildingKind): number | false => {
        const turn = kind === "warehouse" ? (turnRoll < 0.8 ? 0 : 2) : pickTurn(turnRoll);
        const scale = lerpRange(PORT_BUILDING_SCALE_RANGE, scaleRoll) * K;
        const plan = AGED_BUILDING_PLAN[kind];
        // Half-extents along the row and across it, eaves included.
        const sideOn = turn % 2 === 1;
        const halfAlong = ((sideOn ? plan.halfD : plan.halfW) + EAVE_MARGIN) * scale;
        const halfAcross = ((sideOn ? plan.halfW : plan.halfD) + EAVE_MARGIN) * scale;
        const yaw = facingWater + (turn * Math.PI) / 2 + (jitterRoll * 2 - 1) * YAW_JITTER;

        const centre = s + halfAlong;
        const x = cx + dx * t + ax * centre;
        const z = cz + dz * t + az * centre;
        const reach = AGED_BUILDING_HALF_DIAGONAL[kind] * scale;

        const place = (): boolean => {
          if (halfAcross > ROW_HALF_DEPTH + 1e-9) return false;
          if (!inHex(x, z, reach)) return false;
          // The walls' plan, probed on a 3 × 3 grid, and its eaves for the quay.
          const walls = { across: (sideOn ? plan.halfD : plan.halfW) * scale, along: (sideOn ? plan.halfW : plan.halfD) * scale };
          let top = -Infinity;
          let bottom = Infinity;
          for (const u of [-1, 0, 1]) {
            for (const v of [-1, 0, 1]) {
              // Along the row is `a`, towards the water is `d`.
              const px = x + ax * u * walls.across + dx * v * walls.along;
              const pz = z + az * u * walls.across + dz * v * walls.along;
              const h = ground.sampleHeight(px, pz);
              top = Math.max(top, h);
              bottom = Math.min(bottom, h);
              const ex = x + ax * u * halfAlong + dx * v * halfAcross;
              const ez = z + az * u * halfAlong + dz * v * halfAcross;
              if (quays.some((q) => quayTopAt(q, { x: ex, z: ez }) !== undefined)) return false;
            }
          }
          if (bottom <= DRY_HEIGHT) return false;
          if (top - bottom > buildingMaxSpread(BUILDING_FOOTING * scale)) return false;
          if (piers.some((p) => Math.hypot(p.worldX - x, p.worldZ - z) < PIER_WIDTH * K + reach)) return false;
          for (const b of kitHere) {
            const margin = b.kind === "house" || b.kind === "warehouse" ? KIT_MARGIN : CIVIC_MARGIN;
            if (Math.hypot(b.worldX - x, b.worldZ - z) < AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale + reach + margin) return false;
          }
          // Thinning inland: full near the water, sparser behind.
          const keep = inland <= FULL_TOWN_METRES ? 1 : Math.max(FAR_KEEP, 1 - (inland - FULL_TOWN_METRES) / THINNING_METRES);
          if (keepRoll > keep) return false;
          town.push({
            kind,
            worldX: x,
            worldY: buildingGroundY(top),
            worldZ: z,
            yaw,
            scale,
            tint: 1 + (tintRoll * 2 - 1) * PORT_BUILDING_TINT_SPREAD,
          });
          return true;
        };

        return place() ? centre + halfAlong : false;
        };

        // A warehouse that does not fit falls back to a house on the same spot.
        const wantsWarehouse = inland <= WATERFRONT_METRES && kindRoll < WAREHOUSE_SHARE;
        let placed = wantsWarehouse ? tryKind("warehouse") : false;
        if (placed === false) placed = tryKind("house");
        if (placed !== false) {
          s = placed + PARTY_GAP;
          if (++sinceStreet >= streetAt) {
            s += STREET;
            sinceStreet = 0;
            streetAt = Math.round(lerpRange(STREET_EVERY, next()));
          }
        } else {
          s += SKIP;
        }
      }
    }
  }
  return town;
}
