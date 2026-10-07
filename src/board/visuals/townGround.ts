/**
 * The town's ground in the land mesh (#84 prototype). Pure, no Three.js.
 *
 * The land mesh's lattice (`LAND_MESH_SPACING`, about 30 m at a 350 m hex)
 * is far too coarse for a street, a 2 m terrace riser or a road bench: the
 * plateau's terraces were in the field but never on screen. So round each
 * town the mesh is refined: every lattice triangle with a corner near the
 * town (`townGround(...).flag`) is cut into `TOWN_REFINE`² triangles that
 * sample the field itself. The refined surface is blended from the coarse
 * triangle's plane to the field by the barycentric mix of its corners'
 * flags, so along an edge to an unrefined triangle (both corners unflagged)
 * it is exactly that edge, and the mesh has no cracks. Every town feature
 * lies a full lattice step inside the flagged region, where the blend is 1.
 *
 * `surface` says what a point of the town's ground is, for its colour:
 * paving on the main street and the square, packed earth on the lanes, the
 * fort road's gravel.
 */
import {
  fortRoadDistance,
  plateauPlanDistance,
  streetDistance,
  type TownPlateau,
} from "./townPlateau";

/** Cuts per lattice edge of a refined triangle: 0.15 / 10, about 3 m at a 350 m hex. */
export const TOWN_REFINE = 10;
/** The square's paved disc, as a share of the plateau's square radius. */
export const SQUARE_PAVED = 0.55;

export type TownSurface = "paved" | "earth" | "road" | "ground";

export interface TownGround {
  /** Whether a lattice corner at (x, z) is near enough to a town for its triangles to be refined. */
  flag(x: number, z: number): boolean;
  /** What the town's ground at (x, z) is. */
  surface(x: number, z: number): TownSurface;
}

/** (x, z) brought to the copy of the wrapping world nearest `p`. */
const near = (p: { x: number }, x: number, periodX: number | null): number =>
  periodX === null ? x : p.x + ((((x - p.x) % periodX) + periodX * 1.5) % periodX) - periodX / 2;

/** The town ground of the field's plateaus, flagging within `margin` of each town's plan and its fort road; none without plateaus. */
export function townGround(plateaus: readonly TownPlateau[], periodX: number | null, margin: number): TownGround | undefined {
  if (plateaus.length === 0) return undefined;
  const nearby = (x: number, z: number, pad: number) =>
    plateaus.filter((p) => {
      const px = near(p, x, periodX);
      return Math.abs(px - p.x) <= p.reach + pad && Math.abs(z - p.z) <= p.reach + pad;
    });
  return {
    flag: (x, z) =>
      nearby(x, z, margin).some((p) => {
        const px = near(p, x, periodX);
        if (plateauPlanDistance(p, px, z) < margin) return true;
        const road = p.fortRoad;
        return road !== undefined && fortRoadDistance(road, px, z) < road.halfWidth + road.shoulder + margin;
      }),
    surface: (x, z) => {
      for (const p of nearby(x, z, 0)) {
        const px = near(p, x, periodX);
        if (p.fortRoad && fortRoadDistance(p.fortRoad, px, z) < p.fortRoad.halfWidth) return "road";
        if (Math.hypot(px - p.x, z - p.z) < p.squareRadius * SQUARE_PAVED) return "paved";
        for (const street of p.streets) {
          if (streetDistance(street, px, z) < street.halfWidth) return street.kind === "main" ? "paved" : "earth";
        }
      }
      return "ground";
    },
  };
}
