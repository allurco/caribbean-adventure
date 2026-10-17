/**
 * How a ship goes down on her own (#135), when no fight holds her: over
 * SINK_DURATION she rolls, pitches, sinks by SHIP_SINK_DEPTH and fades out,
 * all on one eased curve. The box and the model sink by the same pose. Pure.
 */
import { SHIP_SINK_DEPTH } from "./shipHull";

/** Seconds a ship takes to go down. */
export const SINK_DURATION = 2.0;

/** Where a sinking ship is, `progress` (0..1) of the way down. */
export interface SinkPose {
  /** World units below the waterline. */
  readonly drop: number;
  /** About the ship's long axis (her group's z), radians. */
  readonly roll: number;
  /** About her beam (her group's x), radians. */
  readonly pitch: number;
  /** 1 afloat, 0 gone. */
  readonly opacity: number;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export function sinkPose(progress: number): SinkPose {
  const t = smoothstep(Math.min(Math.max(progress, 0), 1));
  return { drop: SHIP_SINK_DEPTH * t, roll: (Math.PI / 4) * t, pitch: (Math.PI / 8) * t, opacity: 1 - t };
}

/** The progress after `delta` more seconds of sinking, at most 1. */
export function sinkProgress(progress: number, delta: number): number {
  return Math.min(progress + delta / SINK_DURATION, 1);
}
