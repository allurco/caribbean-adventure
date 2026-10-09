/**
 * The open-sea ambience bed's mix (#73): two looping layers, the wide sea
 * (wind over distant swell) and the close water (waves lapping near the
 * hull), crossfaded by how far the camera is from its focus. Wide sea at
 * map zoom, close water at ship zoom and in to the town zoom.
 *
 * Zoom is multiplicative (each wheel notch scales the distance), so the
 * crossfade runs in log distance, and it is equal power so the bed does not
 * dip in loudness halfway. The wind never quite leaves: at ship zoom the wide
 * layer holds a floor under the close water.
 */

/**
 * Camera-to-target distance at and below which the close water plays fully:
 * the ship view (`SHIP_VIEW_DISTANCE` in `board/shipView.ts`, pinned by the
 * tests), so the opening view of the main phase hears the water around the
 * player's ship.
 */
export const AMBIENCE_CLOSE_DISTANCE = 4.32;

/** Camera-to-target distance at and beyond which only the wide sea plays: well inside map zoom (20 to 28). */
export const AMBIENCE_WIDE_DISTANCE = 16;

/** The wide layer's gain at ship zoom: the wind kept under the close water. */
export const AMBIENCE_WIDE_FLOOR = 0.35;

/** Per-layer gains of the bed, 0..1, before each sound's base volume and the master volume. */
export interface AmbienceMix {
  wide: number;
  close: number;
}

/**
 * Where `distance` sits between ship zoom (0) and map zoom (1), linear in log
 * distance. A missing or broken distance (0, negative, NaN) counts as ship zoom.
 */
export function ambienceBlend(distance: number): number {
  if (!(distance > AMBIENCE_CLOSE_DISTANCE)) return 0;
  if (distance >= AMBIENCE_WIDE_DISTANCE) return 1;
  return Math.log(distance / AMBIENCE_CLOSE_DISTANCE) / Math.log(AMBIENCE_WIDE_DISTANCE / AMBIENCE_CLOSE_DISTANCE);
}

/** The bed's layer gains for a camera `distance` from its focus. */
export function ambienceMix(distance: number): AmbienceMix {
  const angle = (ambienceBlend(distance) * Math.PI) / 2;
  return {
    wide: AMBIENCE_WIDE_FLOOR + (1 - AMBIENCE_WIDE_FLOOR) * Math.sin(angle),
    close: Math.cos(angle),
  };
}
