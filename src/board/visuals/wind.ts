/**
 * The scene's one wind (#204), from one pure input: the weather.
 *
 * `windFor(weather)` returns the whole wind: which way it blows and how
 * hard. The sea's wave spectrum, the palms' sway, the reefs' windward foam
 * and the ships' sails and flags all read the scene's wind (`sceneWind.ts`);
 * no other module holds a wind direction of its own (a test scans the
 * sources), so they can never disagree.
 *
 * Shaped like `lightingFor` (#169): V1 pins the input to `TRADE_WIND` on
 * every client and every seed, so the wind is not a variety axis. A later
 * slice that varies the weather only changes which weather is passed.
 *
 * The direction is placed relative to the camera's view, like the sun
 * (lighting.ts), so the sea keeps its look when the camera turns (#36). The
 * sea's spectrum was tuned on this wind (oceanWaves.ts), so it is the
 * reference: the trade wind gives the sea's angle bit for bit.
 */

import { CAMERA_DIRECTION } from "../cameraBounds";
import { viewDirectionXZ } from "./sunDirection";

/** The weather the wind comes from. */
export interface WindWeather {
  /** Swing of the direction the wind blows toward from the camera's view direction, degrees; positive is towards screen right. */
  readonly swingFromViewDeg: number;
  /** Wind speed at 10 m, m/s. */
  readonly speed: number;
}

export interface Wind {
  /** Direction the wind blows toward, radians from +x toward +z (world). */
  readonly angle: number;
  /** Unit world XZ vector the wind blows toward: `[cos angle, sin angle]`. */
  readonly toward: readonly [number, number];
  /** Wind speed at 10 m, m/s. */
  readonly speed: number;
}

/**
 * The Caribbean's steady trade wind: a 7 m/s easterly (Beaufort 4) blowing
 * away from the camera, swung 25° to screen left, so the sea's crests run
 * across the screen and line up with neither the hex rows nor the columns.
 * (Tuned with the old diagonal view as "toward −x, 0.35 rad off the axis",
 * which is this swing from that view.)
 */
export const TRADE_WIND: WindWeather = { swingFromViewDeg: -25, speed: 7 };

export function windFor(weather: WindWeather): Wind {
  const [viewX, viewZ] = viewDirectionXZ(CAMERA_DIRECTION);
  const angle = Math.atan2(viewZ, viewX) + (weather.swingFromViewDeg * Math.PI) / 180;
  return { angle, toward: [Math.cos(angle), Math.sin(angle)], speed: weather.speed };
}
