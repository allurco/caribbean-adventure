/**
 * How a ship goes down (#135). On her own, when no fight holds her, she
 * rolls and pitches over SINK_DURATION on one eased curve, and sinks in two
 * stages: she settles for SETTLE_SECONDS, easing in until her deck meets the
 * water, then goes on down to SHIP_SINK_DEPTH. However she goes down, on her
 * own or held by a fight, she fades by how far she has dropped against her
 * deck (`sinkOpacity`), so she is seen to dissolve as she settles and is gone
 * as her deck goes under. The box and the model sink and fade alike. Pure.
 */
import { SHIP_SINK_DEPTH } from "./shipHull";

/** Seconds a ship takes to go down on her own. */
export const SINK_DURATION = 2.0;
/** Seconds she settles before her deck goes under, fading out as she does. */
export const SETTLE_SECONDS = 0.8;
const SETTLE_SHARE = SETTLE_SECONDS / SINK_DURATION;

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

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * How opaque a ship is, `drop` world units down, her deck `deckHeight` above
 * her waterline (`shipDeckHeight`): 1 afloat, falling steadily with the drop,
 * 0 once her deck is under.
 */
export function sinkOpacity(drop: number, deckHeight: number): number {
  return 1 - clamp01(drop / deckHeight);
}

/** Where a ship going down on her own is, `progress` (0..1) of the way, her deck `deckHeight` above her waterline. */
export function sinkPose(progress: number, deckHeight: number): SinkPose {
  const p = clamp01(progress);
  const t = smoothstep(p);
  // Settling: eased in, slow at first, her deck under at SETTLE_SECONDS; then on down to the sink depth.
  const drop =
    p <= SETTLE_SHARE
      ? deckHeight * (p / SETTLE_SHARE) ** 2
      : deckHeight + (SHIP_SINK_DEPTH - deckHeight) * smoothstep((p - SETTLE_SHARE) / (1 - SETTLE_SHARE));
  return { drop, roll: (Math.PI / 4) * t, pitch: (Math.PI / 8) * t, opacity: sinkOpacity(drop, deckHeight) };
}

/** The progress after `delta` more seconds of sinking, at most 1. */
export function sinkProgress(progress: number, delta: number): number {
  return Math.min(progress + delta / SINK_DURATION, 1);
}
