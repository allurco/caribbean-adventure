/**
 * Frame-callback priorities of the sea (useFrame's second argument): lower
 * runs first.
 */

/**
 * The wave clock (useWaveClock), before every other frame callback: the
 * camera's near plane (−1), the CPU readers of the sea (0) and the cascades.
 * Negative, so it does not take over rendering.
 */
export const WAVE_CLOCK_PRIORITY = -10;

/** The wave cascades (useWaveCascades): before the seabed prepass (0.5) and the composer (1), after the controls. */
export const CASCADE_PRIORITY = 0.25;

/**
 * The ships' wave pose (Ship.tsx, #142): after the wave clock, after the
 * world copies are moved and the ships sail (default priority 0), so a ship
 * samples the sea where it is drawn this frame. Positive like the cascades:
 * the composer (1) renders the frame.
 */
export const SHIP_POSE_PRIORITY = 0.1;

/**
 * The ships' foam flecks (ShipFoamFlecks.tsx, #389): shed from where each
 * ship is drawn this frame, so after the ships sail and take their pose, and
 * before the composer (1) renders the frame.
 */
export const FOAM_FLECK_PRIORITY = 0.2;
