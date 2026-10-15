/**
 * The board's door to the one wind (#204), which lives in the game logic
 * (`src/game/wind.ts`, #264) so the rules can read it too. Re-exported here,
 * defining nothing, so board code keeps one stable import; the scene's wind
 * itself is `SCENE_WIND` (`sceneWind.ts`).
 */

export { TRADE_WIND, windFor } from "../../game/wind";
export type { Wind, WindWeather } from "../../game/wind";
