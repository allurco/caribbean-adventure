/**
 * The one wind (#204, #264), from one pure input: the weather.
 *
 * `windFor(weather)` returns the whole wind: which way it blows and how
 * hard. The rules read it (the weather gauge, `weatherGauge.ts`), and so
 * does the board: the sea's wave spectrum, the palms' sway, the reefs'
 * windward foam and the ships' sails and flags all read the scene's wind
 * (`src/board/visuals/sceneWind.ts`), built from this. No other module
 * holds a wind direction of its own (a test scans the sources), so the
 * rules and the picture can never disagree.
 *
 * The direction is a world angle, in the frame `hexToWorld` places hexes
 * in, so the rules can compare it with ship positions. No React, no
 * Three.js: the rules run server-side too.
 *
 * One fixed wind for now (#259, decision 13): every client and every seed
 * passes `TRADE_WIND`. The wind is not stored in `G`; if it ever changes
 * during a game (#240, #241) it will be, driven by events, so rules take the
 * wind as an argument rather than reading a global.
 */

/** The weather the wind comes from. */
export interface WindWeather {
  /** Direction the wind blows toward, radians from +x toward +z (world, `hexToWorld`'s frame). */
  readonly angle: number;
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
 * The Caribbean's steady trade wind: a 7 m/s easterly (Beaufort 4). It blows
 * toward −z (up the screen, away from the fixed camera) swung 25° toward −x
 * (screen left), so the sea's crests run across the screen and line up with
 * neither the hex rows nor the columns. Written as that sum so the angle is
 * bit for bit the one the sea's spectrum was tuned on (a board test pins it
 * to the camera's view).
 */
export const TRADE_WIND: WindWeather = { angle: -Math.PI / 2 + (-25 * Math.PI) / 180, speed: 7 };

export function windFor(weather: WindWeather): Wind {
  const { angle, speed } = weather;
  return { angle, toward: [Math.cos(angle), Math.sin(angle)], speed };
}
