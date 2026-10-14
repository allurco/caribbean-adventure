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
 * left a tower's top, or a house's foot, outside the volume. Over the
 * ground it reaches at least the tallest building any port can stand
 * (`PORT_MAX_BUILDING_HEIGHT`, derived from the models and their family
 * factors, #176), and a village house counts by its own model's height.
 */
import { hexToWorld, type Hex } from "../../game/hex";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { BUILDING_KINDS } from "./buildingGeometry";
import { familyScaleOf, PORT_BUILDING_SCALE_RANGE, PORT_SETTLEMENT_RADIUS, scaleRangeOf, type PortBuilding } from "./portSettlement";
import { VILLAGE_EAVE, VILLAGE_HEIGHT, VILLAGE_PLAN, VILLAGE_VARIANTS, type VillageVariant } from "./villageBuildingGeometry";
import { BUILDING_SCALE } from "./worldScale";

/**
 * The tallest any port building stands over its ground contact (#176): the
 * tallest kit kind at its family's factor (the landmarks at
 * `LANDMARK_SCALE`, the rest at `BUILDING_SCALE`) or village house at
 * `BUILDING_SCALE`, each at the top of its scale range. The watchtower.
 */
export const PORT_MAX_BUILDING_HEIGHT = Math.max(
  ...BUILDING_KINDS.map((kind) => AGED_BUILDING_HEIGHT[kind] * scaleRangeOf(kind)[1] * familyScaleOf(kind)),
  ...VILLAGE_VARIANTS.map((variant) => VILLAGE_HEIGHT[variant] * PORT_BUILDING_SCALE_RANGE[1] * BUILDING_SCALE)
);

/** A port's building as the hover and the label see it: the kit's by its kind, a village house by its own model. */
export type TownBuilding = PortBuilding & { variant?: VillageVariant };

/** A building's top, world Y: its ground contact plus its model's height at its scale. */
export const buildingTopOf = (b: TownBuilding): number => b.worldY + (b.variant ? VILLAGE_HEIGHT[b.variant] : AGED_BUILDING_HEIGHT[b.kind]) * b.scale;
/** How far a building reaches in plan from its origin: its eaves' corner (a village house) or its plan circle (a kit building). */
export const buildingReachOf = (b: TownBuilding): number =>
  (b.variant ? Math.hypot(VILLAGE_PLAN[b.variant].halfW + VILLAGE_EAVE[b.variant], VILLAGE_PLAN[b.variant].halfD + VILLAGE_EAVE[b.variant]) : AGED_BUILDING_HALF_DIAGONAL[b.kind]) * b.scale;

/** The ground under a port is probed over this radius round the hex centre (`groundTopY`). */
export const PORT_GROUND_PROBE_RADIUS = 0.35;
export const PORT_HOVER_RADIUS = PORT_SETTLEMENT_RADIUS;
/** Air above the tallest top and below the lowest foot, so an edge is never a miss (at `BUILDING_SCALE`). */
export const PORT_HOVER_MARGIN = 0.05;

export interface PortHoverVolume {
  bottom: number;
  top: number;
  radius: number;
}

/** A building's own port is the one whose settlement radius it stands within (ports are never neighbours that close). */
export function portOwnBuildings<B extends PortBuilding>(centre: { x: number; z: number }, buildings: readonly B[]): B[] {
  return buildings.filter((b) => Math.hypot(b.worldX - centre.x, b.worldZ - centre.z) <= PORT_HOVER_RADIUS);
}

/**
 * The volume for a port at `centre` whose probed ground is `groundY`: from
 * the lowest building's foot (or the ground) to the tallest building's top
 * (or the tallest any port stands, over the ground), with the margin either way.
 */
export function portHoverVolume(centre: { x: number; z: number }, groundY: number, buildings: readonly TownBuilding[]): PortHoverVolume {
  // The cap is the tallest building's, the margin at the buildings' scale; the radius is not, so the hover still covers the hex.
  let bottom = groundY;
  let top = groundY + PORT_MAX_BUILDING_HEIGHT;
  for (const b of portOwnBuildings(centre, buildings)) {
    bottom = Math.min(bottom, b.worldY);
    top = Math.max(top, buildingTopOf(b));
  }
  const margin = PORT_HOVER_MARGIN * BUILDING_SCALE;
  return { bottom: bottom - margin, top: top + margin, radius: PORT_HOVER_RADIUS };
}

/** `portHoverVolume` for a port hex. */
export function portHoverVolumeAt(hex: Hex, groundY: number, buildings: readonly TownBuilding[]): PortHoverVolume {
  const [x, , z] = hexToWorld(hex);
  return portHoverVolume({ x, z }, groundY, buildings);
}
