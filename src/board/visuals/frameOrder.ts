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
