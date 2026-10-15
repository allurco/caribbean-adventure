/**
 * PROTOTYPE (combat animation lab, PRD #259): the broadside's geometry and
 * timing. Ship-local world units, the frame of a ship's group in Ship.tsx:
 * bow along +z, starboard toward -x, the waterline at y = 0. The guns are the
 * model's own (its `Cannon_*` nodes), placed at ship scale.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** How big the target is, ship-local units. */
export interface TargetSize {
  length: number;
  beam: number;
  /** Deck height above the waterline. */
  freeboard: number;
  masthead: number;
}

export type Aim = "high" | "low" | "rake";

/** Seconds between guns in a rippled broadside. */
export const RIPPLE_SECONDS = 0.11;
/** Share of shots that miss the ship and fall in the sea. */
export const MISS_SHARE = 0.25;

/** The guns that bear on `side` (1 starboard, -1 port), stern to bow. */
export function gunsOnSide<G extends Vec3>(guns: readonly G[], side: 1 | -1): G[] {
  return guns.filter((g) => (side === 1 ? g.x < 0 : g.x > 0)).sort((a, b) => a.z - b.z);
}

/** The muzzle, `reach` outboard of the gun on its side. */
export function muzzleOf(gun: Vec3, side: 1 | -1, reach: number): Vec3 {
  return { x: gun.x - side * reach, y: gun.y, z: gun.z };
}

export function rippleTimes(count: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(i * spacing * 1e9) / 1e9);
}

/**
 * Where a shot lands on (or by) the target, in the target's frame, with the
 * shooter on its `shooterSide` (1 starboard, -1 port). High shots go into
 * the rigging; low ones at the waterline on the near side; raking ones into
 * the stern. A miss falls in the sea: short of a low aim, past a high one.
 */
export function aimPoint(aim: Aim, size: TargetSize, shooterSide: 1 | -1, random: () => number): Vec3 & { hit: boolean } {
  const near = -shooterSide * (size.beam / 2); // the near side's x (starboard is -x)
  const along = (random() - 0.5) * size.length * 0.8;
  const hit = random() >= MISS_SHARE;
  if (aim === "rake") {
    return { x: (random() - 0.5) * size.beam * 0.7, y: size.freeboard * (0.4 + 0.8 * random()), z: -size.length / 2 - 0.01, hit: true };
  }
  if (aim === "high") {
    if (!hit) return { x: -near * (2 + 3 * random()), y: 0, z: along, hit };
    return { x: (random() - 0.5) * size.beam, y: size.freeboard + (0.25 + 0.6 * random()) * (size.masthead - size.freeboard), z: along * 0.7, hit };
  }
  if (!hit) return { x: near * (1.5 + 2.5 * random()), y: 0, z: along, hit };
  return { x: near, y: size.freeboard * 0.6 * random(), z: along, hit };
}

/** The shot at share `s` of its flight from `from` to `to`, rising `arc` at mid-flight; written to `out`. */
export function shotArc(from: Vec3, to: Vec3, s: number, arc: number, out: Vec3): Vec3 {
  out.x = from.x + (to.x - from.x) * s;
  out.y = from.y + (to.y - from.y) * s + 4 * arc * s * (1 - s);
  out.z = from.z + (to.z - from.z) * s;
  return out;
}

/** Seconds a shot takes over `distance` world units. */
export const shotSeconds = (distance: number): number => 0.1 + 0.16 * distance;

const RECOIL_HEEL = 0.05;
const RECOIL_PERIOD = 1.6;
const RECOIL_DECAY = 0.9;

/**
 * The roll a broadside fired to `side` gives the ship `t` seconds after, a
 * damped rock: it first heels away from its guns (roll positive lifts port).
 */
export function recoilRoll(t: number, side: 1 | -1): number {
  if (t <= 0) return 0;
  return -side * RECOIL_HEEL * Math.exp(-t / RECOIL_DECAY) * Math.sin((2 * Math.PI * t) / RECOIL_PERIOD);
}
