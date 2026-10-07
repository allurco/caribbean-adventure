/**
 * The town's ground in the land mesh (#87). Pure, no Three.js.
 *
 * The land mesh's lattice (`LAND_MESH_SPACING`, about 30 m at the 350 m hex)
 * is far too coarse for a street or a 2 m terrace riser: the plateau's
 * terraces are in the field but would never reach the screen. So round each
 * town the mesh is refined: every lattice triangle with a corner near the
 * town (`townGround(...).flag`) is cut into `TOWN_REFINE`² triangles that
 * sample the field itself. The refined surface is blended from the coarse
 * triangle's plane to the field by the barycentric mix of its corners'
 * flags, so along an edge to an unrefined triangle (both corners unflagged)
 * it is exactly that edge, and the mesh has no cracks. Every town feature
 * lies a full lattice step inside the flagged region, where the blend is 1.
 *
 * `surface` says what a point of the town's ground is, for its colour:
 * setts on the main street and the square, packed earth on the lanes.
 */
import { nearestCopyX, plateauLookup, plateauPlanDistance, streetDistance, type TownPlateau } from "./townPlateau";

/** Cuts per lattice edge of a refined triangle: 0.15 / 10, about 3 m at the 350 m hex. */
export const TOWN_REFINE = 10;
/** The square's paved disc, as a share of the plateau's square radius. */
export const SQUARE_PAVED = 0.55;

export type TownSurface = "paved" | "earth" | "ground";

export interface TownGround {
  /** Whether a lattice corner at (x, z) is near enough to a town for its triangles to be refined. */
  flag(x: number, z: number): boolean;
  /** What the town's ground at (x, z) is. */
  surface(x: number, z: number): TownSurface;
  /** Whether any paving or lane may lie within `radius` of (x, z); where not, `surface` is "ground" throughout. */
  surfaceNear(x: number, z: number, radius: number): boolean;
}

/** The town ground of the field's plateaus, flagging within `margin` of each town's plan; none without plateaus. */
export function townGround(plateaus: readonly TownPlateau[], periodX: number | null, margin: number): TownGround | undefined {
  if (plateaus.length === 0) return undefined;
  const near = plateauLookup(plateaus, periodX, margin);
  return {
    flag: (x, z) => {
      for (const p of near(x, z)) {
        const px = nearestCopyX(p, x, periodX);
        if (Math.abs(px - p.x) > p.reach + margin || Math.abs(z - p.z) > p.reach + margin) continue;
        if (plateauPlanDistance(p, px, z) < margin) return true;
      }
      return false;
    },
    surface: (x, z) => {
      for (const p of near(x, z)) {
        const px = nearestCopyX(p, x, periodX);
        if (Math.abs(px - p.x) > p.reach || Math.abs(z - p.z) > p.reach) continue;
        if (Math.hypot(px - p.x, z - p.z) < p.squareRadius * SQUARE_PAVED) return "paved";
        for (const street of p.streets) {
          if (streetDistance(street, px, z) < street.halfWidth) return street.kind === "main" ? "paved" : "earth";
        }
      }
      return "ground";
    },
    surfaceNear: (x, z, radius) => {
      for (const p of near(x, z)) {
        const px = nearestCopyX(p, x, periodX);
        if (Math.abs(px - p.x) > p.reach + radius || Math.abs(z - p.z) > p.reach + radius) continue;
        if (Math.hypot(px - p.x, z - p.z) < p.squareRadius * SQUARE_PAVED + radius) return true;
        for (const street of p.streets) if (streetDistance(street, px, z) < street.halfWidth + radius) return true;
      }
      return false;
    },
  };
}
