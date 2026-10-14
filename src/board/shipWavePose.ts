/**
 * How a ship rides the swell (#142, ADR 0004): heave, pitch and roll from
 * the sea surface under its hull. Pure, no Three.js, no state between
 * frames: the pose is a function of the surface, the hull box, the world
 * point where the ship is drawn and its heading, so it is the same wherever
 * and whenever it is drawn.
 *
 * The surface is sampled on a grid of taps over the hull's length and beam,
 * and a least-squares plane is fitted through them. The taps are symmetric
 * about the hull's centre, so the fit is closed form: the plane's height at
 * the centre is the mean height, and each slope is Σu·h / Σu² along its own
 * axis. Averaging over the hull is what lets it follow waves longer than
 * itself and ignore shorter ones.
 */
import type { HullBox } from "./shipHull";

/** Height of the sea surface above sea level at world (x, z), world units. */
export type SurfaceHeight = (x: number, z: number) => number;

/** How a hull sits on the sea: heave (world units), pitch and roll (radians). */
export interface WavePose {
  /** Height of the fitted plane at the hull's centre. */
  heave: number;
  /** Bow up, positive. */
  pitch: number;
  /** The hull's local +X side up, positive. */
  roll: number;
}

/** Taps along the hull's length and across its beam. */
export interface WavePoseTaps {
  along: number;
  across: number;
}

export const ZERO_WAVE_POSE: WavePose = { heave: 0, pitch: 0, roll: 0 };

/** `count` offsets spread evenly over [−span/2, span/2], symmetric about 0. */
const tapOffsets = (count: number, span: number): number[] =>
  count === 1 ? [0] : Array.from({ length: count }, (_, i) => span * (i / (count - 1) - 0.5));

/**
 * The pose of a hull `hull` drawn at world (x, z) with `heading` (Ship's
 * atan2(dx, dz): the bow points along (sin h, cos h) and the hull's local +X
 * along (cos h, −sin h)) on the surface `height`. Samples the surface where
 * the ship is drawn and never wraps x: the caller passes the drawn point.
 */
export function shipWavePose(
  height: SurfaceHeight,
  hull: HullBox,
  x: number,
  z: number,
  heading: number,
  taps: WavePoseTaps = { along: 5, across: 3 }
): WavePose {
  const [beam, , length] = hull;
  const alongOffsets = tapOffsets(taps.along, length);
  const acrossOffsets = tapOffsets(taps.across, beam);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const sx = Math.cos(heading);
  const sz = -Math.sin(heading);

  let sumH = 0;
  let sumUH = 0;
  let sumVH = 0;
  let sumUU = 0;
  let sumVV = 0;
  for (const u of alongOffsets) {
    for (const v of acrossOffsets) {
      const h = height(x + u * fx + v * sx, z + u * fz + v * sz);
      sumH += h;
      sumUH += u * h;
      sumVH += v * h;
      sumUU += u * u;
      sumVV += v * v;
    }
  }
  const slopeAlong = sumUU > 0 ? sumUH / sumUU : 0;
  const slopeAcross = sumVV > 0 ? sumVH / sumVV : 0;
  return {
    heave: sumH / (alongOffsets.length * acrossOffsets.length),
    pitch: Math.atan(slopeAlong),
    roll: Math.atan(slopeAcross),
  };
}

/**
 * The Euler rotation (x, y, z, Three's default XYZ order) that tilts a ship's
 * group, bow along local +Z, into `pose`. A rotation about +X tips +Z down,
 * so a bow-up pitch turns by −pitch; one about +Z lifts +X, so roll turns by
 * +roll.
 */
export const wavePoseRotation = (pose: WavePose): [number, number, number] => [-pose.pitch, 0, pose.roll];
