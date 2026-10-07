/**
 * Scale placeholders for the #83 and #84 prototypes (throwaway): plain boxes
 * the size of a real house, the aged house's plan and ridge (about 12 × 9 m
 * and 15 m at today's 65 m a unit) times the #84 prop scale, packed as
 * tightly as they fit on every port hex. They stand in rows parallel to the
 * beach, from the first dry row inland, thinning with distance from the
 * shore, off wet or steep ground, off the quay and the pier's land end, and
 * clear of the port's own buildings. Not a kit, not kept. Pure, no Three.js.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors, canonicalHex, type MapWrap } from "../../game/hex";
import { AGED_BUILDING_HALF_DIAGONAL, GABLED } from "./agedBuildingGeometry";
import type { GroundField } from "./groundPlacement";
import type { PortBuilding } from "./portSettlement";
import { quayTopAt, type QuayPlacement } from "./quayPlacement";
import { PIER_WIDTH } from "./pierGeometry";
import { SEA_LEVEL } from "./terrainHeightField";
import { PROP_SCALE } from "./propScale";
import { seedOf, stream } from "./variationStream";

/** The box in world units: width across the front, depth, wall (eave) and ridge heights. */
export const HOUSE_BOX = {
  w: GABLED.house.w * PROP_SCALE,
  d: GABLED.house.d * PROP_SCALE,
  eave: GABLED.house.eave * PROP_SCALE,
  ridge: GABLED.house.ridge * PROP_SCALE,
} as const;
/** How far the box carries on below its ground contact so a slope never shows air under it. */
export const HOUSE_BOX_FOOTING = 0.03 * PROP_SCALE;
/** Metres one world unit stands for at the prop scale (65 today): the thinning is set in metres. */
const PROP_METRES_PER_UNIT = 65 / PROP_SCALE;
/** Slot pitch across the front (a narrow gap between houses) and between rows (a lane). */
const COLUMN_PITCH = HOUSE_BOX.w * 1.12;
const ROW_PITCH = HOUSE_BOX.d * 1.55;
/** Every this many slots along a row one is left out: a cross street. */
const CROSS_STREET_EVERY = 6;
/** Rows within this many metres of the first dry row are full; past it the town thins to `FAR_KEEP`. */
const FULL_TOWN_METRES = 120;
const THINNING_METRES = 600;
const FAR_KEEP = 0.12;
/** The ground under a house: at least this high over the sea, at most this steep corner to corner. */
const DRY_HEIGHT = SEA_LEVEL + 0.02 * PROP_SCALE;
const MAX_SLOPE = 0.6;
/** Gap kept from the port's own buildings. */
const BUILDING_GAP = 0.03 * PROP_SCALE;
const SALT = 0x2c6e9b13;
const SQRT3 = Math.sqrt(3);
const HALF_DIAGONAL = Math.hypot(HOUSE_BOX.w, HOUSE_BOX.d) / 2;

export interface HouseBox {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Turn about the vertical axis; the front faces +z before the turn. */
  yaw: number;
}

/** What the boxes keep clear of: the settlement as `decorationLayout` placed it. */
export interface PortKit {
  buildings: readonly PortBuilding[];
  quays: readonly QuayPlacement[];
  /** The piers' land ends. */
  piers: readonly { worldX: number; worldZ: number }[];
}

/** The houses on every port hex, standing on `ground`'s highest point under them; `seed` is the terrain seed. */
export function houseScaleBoxes(cells: readonly MapCell[], ground: GroundField, wrap: MapWrap, kit: PortKit, seed = 0): HouseBox[] {
  const water = new Set<string>();
  for (const cell of cells) if (cell.terrain !== "island") water.add(`${cell.hex.q},${cell.hex.r}`);
  const boxes: HouseBox[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [cx, , cz] = hexToWorld(cell.hex);
    const near = <T extends { worldX: number; worldZ: number }>(items: readonly T[]) =>
      items.filter((i) => Math.hypot(i.worldX - cx, i.worldZ - cz) < 1);
    const buildings = near(kit.buildings);
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
    const yaw = Math.atan2(dx, dz);
    const next = stream(seedOf([cell.hex.q, cell.hex.r], SALT ^ seed));

    const inHex = (x: number, z: number) =>
      edgeNormals.every(([ux, uz]) => (x - cx) * ux + (z - cz) * uz <= SQRT3 / 2 - HALF_DIAGONAL);
    const columns = Math.floor(SQRT3 / COLUMN_PITCH);
    const rows = Math.floor(SQRT3 / ROW_PITCH);
    // Per column, how far inland (units) its first dry row was, once found.
    const firstDry = new Map<number, number>();

    // From the water side inland, one row at a time.
    for (let row = 0; row <= rows; row++) {
      const t = SQRT3 / 2 - row * ROW_PITCH;
      for (let col = -columns; col <= columns; col++) {
        const keepRoll = next();
        if (((col % CROSS_STREET_EVERY) + CROSS_STREET_EVERY) % CROSS_STREET_EVERY === CROSS_STREET_EVERY - 1) continue;
        const s = col * COLUMN_PITCH;
        const x = cx + dx * t + ax * s;
        const z = cz + dz * t + az * s;
        if (!inHex(x, z)) continue;
        let top = -Infinity;
        let bottom = Infinity;
        let onQuay = false;
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [0, 0],
        ]) {
          const px = x + (ax * u * HOUSE_BOX.w + dx * v * HOUSE_BOX.d) / 2;
          const pz = z + (az * u * HOUSE_BOX.w + dz * v * HOUSE_BOX.d) / 2;
          const h = ground.sampleHeight(px, pz);
          top = Math.max(top, h);
          bottom = Math.min(bottom, h);
          if (quays.some((q) => quayTopAt(q, { x: px, z: pz }) !== undefined)) onQuay = true;
        }
        if (bottom <= DRY_HEIGHT || onQuay) continue;
        if ((top - bottom) / (2 * HALF_DIAGONAL) > MAX_SLOPE) continue;
        if (piers.some((p) => Math.hypot(p.worldX - x, p.worldZ - z) < PIER_WIDTH * PROP_SCALE + HALF_DIAGONAL)) continue;
        if (
          buildings.some(
            (b) => Math.hypot(b.worldX - x, b.worldZ - z) < AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale + HALF_DIAGONAL + BUILDING_GAP
          )
        )
          continue;
        // Thinning: full near the shore, sparser inland.
        if (!firstDry.has(col)) firstDry.set(col, t);
        const inland = ((firstDry.get(col) ?? t) - t) * PROP_METRES_PER_UNIT;
        const keep = inland <= FULL_TOWN_METRES ? 1 : Math.max(FAR_KEEP, 1 - (inland - FULL_TOWN_METRES) / THINNING_METRES);
        if (keepRoll > keep) continue;
        boxes.push({ worldX: x, worldY: top, worldZ: z, yaw });
      }
    }
  }
  return boxes;
}
