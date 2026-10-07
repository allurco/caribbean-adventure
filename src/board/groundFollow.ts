import { CAMERA_DIRECTION, OLD_CAMERA_MIN_DISTANCE } from "./cameraBounds";

/**
 * The camera focus follows the ground at town zoom (#90).
 *
 * MapControls keeps its target on the sea plane, which is right at map and
 * mid zoom: the camera flies far above the highest ground. At town zoom it is
 * well under a unit from its target, and land rises up to ~1.9 units (a
 * mountain hex plus its relief, `terrainHeightField.ts`), so a sea-level
 * target under a hilltop fort put the camera inside the hill. The focus
 * height therefore blends from the sea plane onto the ground (the one
 * terrain height field, ADR 0001) as the camera closes in, and is lifted
 * further whenever the camera, or the first stretch of its line of sight,
 * would come within `CAMERA_GROUND_CLEARANCE` of the ground.
 *
 * Pure: the ground comes in as a sampler, world (x, z) to world y.
 */

export type GroundSampler = (x: number, z: number) => number;

/**
 * Camera-to-focus distance from which the focus stays on the sea plane, as
 * it always did: today's old zoom floor (#62), so every view the game
 * allowed before the town zoom is unchanged.
 */
export const GROUND_FOLLOW_FAR = OLD_CAMERA_MIN_DISTANCE;
/**
 * Camera-to-focus distance from which the focus sits fully on the ground.
 * Close enough that, with the focus on a mountain hex's ground, the view
 * never reaches further across the sea than it did at the old floor, so the
 * ocean grid's fine ring still covers it (oceanGrid.test.ts).
 */
export const GROUND_FOLLOW_NEAR = 1.5;
/**
 * Radius of the ground averaged under the focus, world units (~25 m): the
 * height field's noise and a street's kerb do not bob the view as it pans.
 */
export const GROUND_FOLLOW_RADIUS = 0.4;
/**
 * Least height, world units (~13 m), kept between the ground and the camera
 * and the stretch of its line of sight nearest it: clear of roofs, palms
 * and the camera's near plane.
 */
export const CAMERA_GROUND_CLEARANCE = 0.2;
/**
 * How far along its line of sight from the camera the clearance is kept,
 * world units. Only geometry near the camera can be cut by the near plane;
 * further along, a ridge simply hides what is behind it.
 */
export const CAMERA_CLEARANCE_REACH = 0.5;

/** Points averaged under the focus: the centre twice, and a ring of six. */
const RING = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  return [Math.cos(a), Math.sin(a)] as const;
});

/** Line-of-sight samples between the camera (0) and the clearance reach (1). */
const SIGHT_STEPS = 6;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** How far the focus is on the ground (1) rather than the sea plane (0) at camera `distance`. */
export function groundFollowWeight(distance: number): number {
  return 1 - smoothstep(GROUND_FOLLOW_NEAR, GROUND_FOLLOW_FAR, distance);
}

function averageGround(x: number, z: number, ground: GroundSampler): number {
  let sum = 2 * ground(x, z);
  for (const [cx, cz] of RING) sum += ground(x + cx * GROUND_FOLLOW_RADIUS, z + cz * GROUND_FOLLOW_RADIUS);
  return sum / (RING.length + 2);
}

/**
 * World y of the focus at (x, z) for a camera `distance` from it along
 * `CAMERA_DIRECTION`: the sea plane at map and mid zoom, the averaged ground
 * (never below the sea) at town zoom, eased in between, and lifted wherever
 * the camera or its nearby line of sight would come within
 * `CAMERA_GROUND_CLEARANCE` of the ground.
 */
export function focusHeight(focus: { x: number; z: number }, distance: number, ground: GroundSampler): number {
  const w = groundFollowWeight(distance);
  let y = w > 0 ? w * Math.max(0, averageGround(focus.x, focus.z, ground)) : 0;

  const reach = Math.min(CAMERA_CLEARANCE_REACH, distance);
  for (let i = 0; i <= SIGHT_STEPS; i++) {
    // `along` from the focus towards the camera: distance at the camera.
    const along = distance - (reach * i) / SIGHT_STEPS;
    const x = focus.x + along * CAMERA_DIRECTION[0];
    const z = focus.z + along * CAMERA_DIRECTION[2];
    const needed = ground(x, z) + CAMERA_GROUND_CLEARANCE - along * CAMERA_DIRECTION[1];
    if (needed > y) y = needed;
  }
  return y;
}
