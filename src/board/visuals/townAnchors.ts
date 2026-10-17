/**
 * Where the towns' smoke and lights will be (#181): every chimney's mouth,
 * every shuttered window and every lantern of the villages, in the world.
 * Pure, no Three.js. The life slice of #158 puts smoke at the chimneys; a
 * later night (ADR 0002 amendment (b)) lights the windows and lanterns.
 *
 * Each building's anchors (`villageAnchors`, at scale 1 in its own frame)
 * are turned, scaled and moved as `villageMesh.ts` places its model, so an
 * anchor lands on the drawn chimney or window; the market hall adds the
 * lanterns under its eave.
 */
import type { Vec3 } from "./facetBuilder";
import type { PortFurniture } from "./harbourFurniture";
import { MARKET_HALL_LANTERNS } from "./harbourPieces";
import { villageAnchors } from "./villageBuildingGeometry";
import type { VillageBuilding } from "./villageLayout";

export interface TownAnchors {
  chimneys: Vec3[];
  windows: Vec3[];
  lanterns: Vec3[];
}

/** A local point of a model placed at (x, y, z), turned by `yaw` and scaled, in the world (`mergeVillage`'s transform). */
export function placeAnchor(p: Vec3, at: { x: number; y: number; z: number; yaw: number; scale: number }): Vec3 {
  const cos = Math.cos(at.yaw);
  const sin = Math.sin(at.yaw);
  return [at.x + (p[0] * cos + p[2] * sin) * at.scale, at.y + p[1] * at.scale, at.z + (-p[0] * sin + p[2] * cos) * at.scale];
}

/** Every village's anchors, the market halls' lanterns among them. */
export function townAnchors(buildings: readonly VillageBuilding[], furniture: readonly PortFurniture[]): TownAnchors {
  const out: TownAnchors = { chimneys: [], windows: [], lanterns: [] };
  for (const b of buildings) {
    const a = villageAnchors(b.variant);
    const at = { x: b.worldX, y: b.worldY, z: b.worldZ, yaw: b.yaw, scale: b.scale };
    for (const p of a.chimneys) out.chimneys.push(placeAnchor(p, at));
    for (const p of a.windows) out.windows.push(placeAnchor(p, at));
    for (const p of a.lanterns) out.lanterns.push(placeAnchor(p, at));
  }
  for (const f of furniture) if (f.hall) for (const p of MARKET_HALL_LANTERNS) out.lanterns.push(placeAnchor(p, f.hall));
  return out;
}
