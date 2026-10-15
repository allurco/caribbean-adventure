/**
 * The drift the one wind gives what it carries over the sea (#263): smoke,
 * embers, spray. Downwind in world XZ, the same direction the ships' flags
 * stream (`shipWind.ts`), at `speed` world units a second. Pure.
 */
import type { Wind } from "../visuals/wind";

export function windDrift(wind: Wind, speed: number): [number, number] {
  return [wind.toward[0] * speed, wind.toward[1] * speed];
}
