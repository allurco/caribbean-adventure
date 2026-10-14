/**
 * The light the board is drawn under: `lightingFor` at the scene's time of
 * day, the one place the scene reads its light from (#169).
 *
 * V1 pins the time to golden hour on every client and every seed, live or
 * async (#158 decisions 10 and 14, ADR 0002 amendment b). A day/night slice
 * for live games (#187) takes the time from the shared game clock instead,
 * and the board's lights, sky and post follow through their `lighting` props;
 * the two materials that bake the sun's direction in at build time (the grid
 * glare and the boulder caustics) would then read it as a uniform.
 */

import { GOLDEN_HOUR, lightingFor, type Lighting, type TimeOfDay } from "./lighting";

export const SCENE_TIME_OF_DAY: TimeOfDay = GOLDEN_HOUR;

export const SCENE_LIGHTING: Lighting = lightingFor(SCENE_TIME_OF_DAY);
