import { createContext, useContext } from "react";
import type { SeaSurface } from "./seaSurface";
import type { WaveClock } from "./waveClock";

/**
 * The scene's one CPU sea surface and the wave clock it is read at (#141,
 * #142): provided once inside the board's Canvas, so the ships and the dev
 * buoys share one surface (and its key-grid cache).
 */
export interface SeaSurfaceValue {
  clock: WaveClock;
  surface: SeaSurface;
}

export const SeaSurfaceContext = createContext<SeaSurfaceValue | null>(null);

/** The scene's sea surface, or null outside a provider (labs, prop viewer): there, ships sit level. */
export const useSeaSurface = (): SeaSurfaceValue | null => useContext(SeaSurfaceContext);
