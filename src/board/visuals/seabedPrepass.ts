/**
 * The seabed prepass (#38): everything under the water surface is drawn on
 * its own layer, so it can be rendered without the water.
 */

/** three.js layer for geometry the seabed prepass draws. */
export const SEABED_LAYER = 1;
