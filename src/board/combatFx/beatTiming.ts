/**
 * Combat effects (#263, from the #259 lab): the beats, how long each
 * plays, and the curves the one-off motions follow (the camera's framing,
 * the mast's fall, the sinking), as pure functions of a beat's progress.
 */

/** The beats of today's fight whose length is fixed; a volley lasts as long as its guns take (combatTimeline.ts). */
export type BeatId = "declare" | "flee" | "closeAlongside" | "mastFalls" | "sink";

export interface Beat {
  readonly label: string;
  /** How long the beat plays, s (its effects may linger after). */
  readonly seconds: number;
}

export const BEATS: Readonly<Record<BeatId, Beat>> = {
  declare: { label: "Declare", seconds: 2.4 },
  flee: { label: "Flee", seconds: 5 },
  closeAlongside: { label: "Close alongside (grapples)", seconds: 5.5 },
  mastFalls: { label: "Mast falls", seconds: 3.4 },
  sink: { label: "Sink", seconds: 7 },
};

/** How much shorter beats play under reduced motion. */
export const REDUCED_MOTION_PACE = 0.5;

/** A beat's length, shortened under reduced motion. */
export const pacedSeconds = (seconds: number, reducedMotion: boolean): number =>
  reducedMotion ? seconds * REDUCED_MOTION_PACE : seconds;

export const beatProgress = (elapsed: number, seconds: number): number => Math.min(1, Math.max(0, elapsed / seconds));

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/** Share of the mast-falls beat at which the topmast hits the water. */
export const MAST_LANDS_AT = 0.62;
/** The shudder before it goes: a share of the beat. */
const MAST_SHUDDER = 0.12;
/** The angle it comes to rest at, lying over the side: a little past flat, in the water. */
const MAST_REST = Math.PI / 2 + 0.12;

/**
 * The broken topmast's angle off upright over the beat's progress `t`: a
 * shudder as the shot strikes, a fall that quickens like a falling body
 * (the square of time), a jolt as it hits the water, then it lies there.
 */
export function mastTopple(t: number): number {
  if (t < MAST_SHUDDER) return 0.03 * Math.sin((t / MAST_SHUDDER) * Math.PI);
  if (t < MAST_LANDS_AT) {
    const s = (t - MAST_SHUDDER) / (MAST_LANDS_AT - MAST_SHUDDER);
    return MAST_REST * s * s;
  }
  const after = (t - MAST_LANDS_AT) / (1 - MAST_LANDS_AT);
  return MAST_REST - 0.12 * Math.exp(-after * 5) * Math.sin(after * 14);
}

/** How a sinking ship lies over the beat's progress: how far down (share of its sink depth), bow-up pitch and list. */
export function sinkPose(t: number): { drop: number; pitch: number; heel: number } {
  if (t <= 0) return { drop: 0, pitch: 0, heel: 0 };
  // She settles first, listing as she fills, then goes by the stern, faster at the end.
  const settle = easeInOutSine(Math.min(1, t / 0.6));
  const plunge = Math.max(0, (t - 0.45) / 0.55);
  return {
    drop: 0.25 * settle + 0.75 * plunge * plunge,
    pitch: 0.12 * settle + 0.35 * plunge * plunge,
    heel: 0.22 * settle + 0.08 * plunge,
  };
}

/**
 * Where the camera looks and how far back it stands (along the game's view
 * direction) to frame `points` (ships, and where a ship is about to run to)
 * with room round each for a ship's length.
 */
export function framePoints(
  points: readonly { x: number; z: number }[],
  { fovDeg, aspect, shipLength }: { fovDeg: number; aspect: number; shipLength: number }
): { target: [number, number, number]; distance: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const room = shipLength / 2 + 0.35;
  const halfSpan = Math.hypot(maxX - minX, maxZ - minZ) / 2 + room;
  // One behind the other (along the view, up the screen) they must fit the screen's height too.
  const halfDepth = (maxZ - minZ) / 2 + room;
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const distance = Math.max(1.6, halfSpan / (tanHalf * Math.min(aspect, 1.5)), halfDepth / tanHalf);
  return { target: [(minX + maxX) / 2, 0.12, (minZ + maxZ) / 2], distance };
}

/** Frames two ships (framePoints). */
export function frameShips(
  a: { x: number; z: number },
  b: { x: number; z: number },
  options: { fovDeg: number; aspect: number; shipLength: number }
): { target: [number, number, number]; distance: number } {
  return framePoints([a, b], options);
}
