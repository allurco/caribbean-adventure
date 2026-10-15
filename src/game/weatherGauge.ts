/**
 * The weather gauge (#259, #264): of two ships, the one upwind of the other
 * holds it. Pure, and given the wind as an argument (the wind is fixed for
 * now but will live in `G` if it ever changes, `wind.ts`).
 *
 * The rule, in world space (`hexToWorld`'s frame, the wind's frame too):
 * take the line from A to B, the short way round the east–west seam. If it
 * runs more than `SQUARE_TO_WIND_DEG` away from square to the wind, the ship
 * the wind blows from holds the gauge. Within that band of square, or on the
 * same hex, neither does: a tie.
 *
 * It has no rules effect yet; firing first and +1 to escape come with the
 * combat orders.
 */

import { hexToWorld, nearestImage, NO_WRAP, type Hex, type MapWrap } from "./hex";
import type { Wind } from "./wind";

/** Either ship in a fight: its id and where it lies. */
export interface GaugeShip {
  readonly id: string;
  readonly position: Hex;
}

/** How close to square to the wind, in degrees either side, the line between two ships counts as a tie. */
export const SQUARE_TO_WIND_DEG = 15;
const TIE_BAND = Math.sin((SQUARE_TO_WIND_DEG * Math.PI) / 180);

/** The id of the ship holding the weather gauge, or null when neither does. */
export function holdsGauge(a: GaugeShip, b: GaugeShip, wind: Wind, wrap: MapWrap = NO_WRAP): string | null {
  const [ax, , az] = hexToWorld(a.position);
  const [bx, , bz] = hexToWorld(nearestImage(a.position, b.position, wrap));
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length === 0) return null;
  // Cosine of the angle between the line A→B and the wind: positive when B lies downwind of A.
  const downwind = (dx * wind.toward[0] + dz * wind.toward[1]) / length;
  if (downwind > TIE_BAND) return a.id;
  if (downwind < -TIE_BAND) return b.id;
  return null;
}
