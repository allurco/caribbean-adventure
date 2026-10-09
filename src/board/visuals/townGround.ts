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
import { nearestCopyX, plateauLookup, plateauPlanDistance, SQUARE_PAVED, streetDistance, type TownPlateau } from "./townPlateau";

/** Cuts per lattice edge of a refined triangle: 0.15 / 10, about 3 m at the 350 m hex. */
export const TOWN_REFINE = 10;
export { SQUARE_PAVED };

/**
 * The paving's tone (#91): a multiplier on the setts' and the lanes' colour
 * within this range, varying smoothly over patches about `PAVING_TONE_CELL`
 * across (about 1.3 m), so worn and fresh stretches show without the
 * per-face jumps that drew the ground's triangles as a checkerboard.
 */
export const PAVING_TONE: readonly [number, number] = [0.86, 1.1];
const PAVING_TONE_CELL = 0.02;

/** A lattice corner's value in [0, 1). */
function latticeValue(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The paving's tone at (x, z): value noise on a `PAVING_TONE_CELL` lattice, smoothly interpolated (`PAVING_TONE`). */
export function pavingTone(x: number, z: number): number {
  const u = x / PAVING_TONE_CELL;
  const v = z / PAVING_TONE_CELL;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const su = fu * fu * (3 - 2 * fu);
  const sv = fv * fv * (3 - 2 * fv);
  const top = latticeValue(i, j) + (latticeValue(i + 1, j) - latticeValue(i, j)) * su;
  const bottom = latticeValue(i, j + 1) + (latticeValue(i + 1, j + 1) - latticeValue(i, j + 1)) * su;
  return PAVING_TONE[0] + (top + (bottom - top) * sv) * (PAVING_TONE[1] - PAVING_TONE[0]);
}

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
