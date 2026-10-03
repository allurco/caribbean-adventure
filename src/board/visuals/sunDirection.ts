/**
 * Sun placement relative to the camera.
 *
 * The camera never rotates (MapControls has rotation off), so the sun can be
 * placed by where it should appear from the player's point of view rather than
 * by compass direction: an elevation above the horizon and an azimuth measured
 * from the camera's horizontal view direction.
 */

export type Vec3 = readonly [number, number, number];

const DEG = Math.PI / 180;

/** Horizontal (XZ) unit direction a camera at `cameraOffset` from its target looks along. */
export function viewDirectionXZ(cameraOffset: Vec3): [number, number] {
  const len = Math.hypot(cameraOffset[0], cameraOffset[2]);
  return [-cameraOffset[0] / len, -cameraOffset[2] / len];
}

/**
 * Unit vector towards the sun.
 *
 * @param viewXZ - the camera's horizontal view direction (unit length)
 * @param elevationDeg - sun height above the horizon
 * @param azimuthDeg - swing from the view direction; positive is towards screen right
 */
export function sunDirection(
  viewXZ: readonly [number, number],
  elevationDeg: number,
  azimuthDeg: number
): [number, number, number] {
  const [vx, vz] = viewXZ;
  // Screen right is view × up: (vx, 0, vz) × (0, 1, 0) = (−vz, 0, vx).
  const az = azimuthDeg * DEG;
  const hx = Math.cos(az) * vx - Math.sin(az) * vz;
  const hz = Math.cos(az) * vz + Math.sin(az) * vx;
  const el = elevationDeg * DEG;
  return [hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)];
}
