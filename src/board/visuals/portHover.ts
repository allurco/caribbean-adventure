/**
 * The port's hover volume (#59). Pure, no Three.js.
 *
 * An invisible cylinder over the settlement that the pointer is tested
 * against, so a pointer over any part of a building or the ground between
 * them shows the port tooltip. Its radius is the settlement's envelope
 * (`PORT_SETTLEMENT_RADIUS`: every building's farthest corner, inside the
 * hex's inradius so no neighbour's hover is taken). Its height follows the
 * buildings that were actually placed: they stand on the drawn surface out
 * to the settlement's edge, which on a beach rising inland can be well
 * above (or, down the shore ramp, well below) the ground the probe finds
 * round the hex centre, so a fixed cap's worth of air over that ground
 * left a tower's top, or a house's foot, outside the volume.
 */
import { hexToWorld, type Hex } from "../../game/hex";
import { AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { PORT_SETTLEMENT_RADIUS, type PortBuilding } from "./portSettlement";
import { BUILDING_SCALE } from "./propScale";

/** The ground under a port is probed over this radius round the hex centre (`groundTopY`). */
export const PORT_GROUND_PROBE_RADIUS = 0.35;
export const PORT_HOVER_RADIUS = PORT_SETTLEMENT_RADIUS;
/** Air above the tallest top and below the lowest foot, so an edge is never a miss. */
export const PORT_HOVER_MARGIN = 0.05;

export interface PortHoverVolume {
  bottom: number;
  top: number;
  radius: number;
}

/** A building's own port is the one whose settlement radius it stands within (ports are never neighbours that close). */
export function portOwnBuildings(centre: { x: number; z: number }, buildings: readonly PortBuilding[]): PortBuilding[] {
  return buildings.filter((b) => Math.hypot(b.worldX - centre.x, b.worldZ - centre.z) <= PORT_HOVER_RADIUS);
}

/**
 * The volume for a port at `centre` whose probed ground is `groundY`: from
 * the lowest building's foot (or the ground) to the tallest building's top
 * (or the building cap over the ground), with the margin either way.
 */
export function portHoverVolume(centre: { x: number; z: number }, groundY: number, buildings: readonly PortBuilding[]): PortHoverVolume {
  let bottom = groundY;
  // Heights follow the #84 prop scale (1 unless `?hexMetres` is given); the
  // radius does not: the experiment's town fills the hex, so the hover must too.
  let top = groundY + BUILDING_MAX_HEIGHT * BUILDING_SCALE;
  for (const b of portOwnBuildings(centre, buildings)) {
    bottom = Math.min(bottom, b.worldY);
    top = Math.max(top, b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale);
  }
  const margin = PORT_HOVER_MARGIN * BUILDING_SCALE;
  return { bottom: bottom - margin, top: top + margin, radius: PORT_HOVER_RADIUS };
}

/** `portHoverVolume` for a port hex. */
export function portHoverVolumeAt(hex: Hex, groundY: number, buildings: readonly PortBuilding[]): PortHoverVolume {
  const [x, , z] = hexToWorld(hex);
  return portHoverVolume({ x, z }, groundY, buildings);
}
