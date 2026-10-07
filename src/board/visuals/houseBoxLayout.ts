/**
 * Scale placeholders for the #83 prototype: plain boxes at the proposed
 * tiny-house scale (a third of the aged house's plan, same roof height
 * ratio) in two rows along the beach side of every port hex, so house,
 * massif, existing buildings and ship can be judged in one screenshot. Not a
 * kit, not kept. Pure, no Three.js.
 */
import type { MapCell } from "../../game/types";
import { hexToWorld, neighbors, canonicalHex, type MapWrap } from "../../game/hex";
import { GABLED } from "./agedBuildingGeometry";
import type { TerrainHeightField } from "./terrainHeightField";

/** Fraction of the aged house's plan and heights. */
export const HOUSE_BOX_SCALE = 1 / 3;
/** The box in local units: width across the front, depth, wall (eave) and ridge heights. */
export const HOUSE_BOX = {
  w: GABLED.house.w * HOUSE_BOX_SCALE,
  d: GABLED.house.d * HOUSE_BOX_SCALE,
  eave: GABLED.house.eave * HOUSE_BOX_SCALE,
  ridge: GABLED.house.ridge * HOUSE_BOX_SCALE,
} as const;
/** How far the box carries on below its ground contact so a slope never shows air under it. */
export const HOUSE_BOX_FOOTING = 0.03;
/** The two rows' distances from the port centre towards the water. */
const ROW_DISTANCES = [0.3, 0.42] as const;
/** Positions along each row (left and right of the pier line, which stays clear). */
const ROW_OFFSETS = [-0.55, -0.44, -0.33, 0.33, 0.44, 0.55] as const;

export interface HouseBox {
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Turn about the vertical axis; the front faces +z before the turn. */
  yaw: number;
}

/** Boxes on every port hex: two rows of six, facing the water, standing on the field's highest ground under them. */
export function houseScaleBoxes(cells: readonly MapCell[], field: TerrainHeightField, wrap: MapWrap): HouseBox[] {
  const water = new Set<string>();
  for (const cell of cells) if (cell.terrain !== "island") water.add(`${cell.hex.q},${cell.hex.r}`);
  const boxes: HouseBox[] = [];
  for (const cell of cells) {
    if (!cell.hasPort) continue;
    const [cx, , cz] = hexToWorld(cell.hex);
    // Towards the water: the mean direction to the water neighbours.
    let dx = 0;
    let dz = 0;
    for (const n of neighbors(cell.hex)) {
      const c = canonicalHex(n, wrap);
      if (!water.has(`${c.q},${c.r}`)) continue;
      const [nx, , nz] = hexToWorld(n);
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
    for (const distance of ROW_DISTANCES) {
      for (const offset of ROW_OFFSETS) {
        const x = cx + dx * distance + ax * offset;
        const z = cz + dz * distance + az * offset;
        let top = -Infinity;
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [0, 0],
        ]) {
          const px = x + (ax * u * HOUSE_BOX.w + dx * v * HOUSE_BOX.d) / 2;
          const pz = z + (az * u * HOUSE_BOX.w + dz * v * HOUSE_BOX.d) / 2;
          top = Math.max(top, field.sampleHeight(px, pz));
        }
        if (top <= 0.02) continue;
        boxes.push({ worldX: x, worldY: top, worldZ: z, yaw });
      }
    }
  }
  return boxes;
}
