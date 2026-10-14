/**
 * The wind the board is drawn in: `windFor` at the scene's weather, the one
 * place the scene reads its wind from (#204). The sea's spectrum, the palms,
 * the reefs' windward foam and the ships' sails and flags all take it from
 * here.
 *
 * V1 pins the weather to the steady trade wind on every client and every
 * seed. A later slice that varies it passes another weather here; the
 * modules that bake the direction in at build time (the wave spectrum, the
 * palm shader, the reef weight) would then read it as a uniform.
 */

import { TRADE_WIND, windFor, type Wind } from "./wind";

export const SCENE_WIND: Wind = windFor(TRADE_WIND);
