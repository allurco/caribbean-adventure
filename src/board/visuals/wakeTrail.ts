/**
 * Each ship's recent path, for its wake (#144). Pure, no Three.js: the water
 * (Ocean.tsx) updates it once a frame from the ships' registry
 * (shipFoamSources.ts) on the wave clock's step (waveClock.ts), and writes
 * its segments into the uniform arrays the wake foam reads (wakeFoam.ts).
 *
 * - A ship lays a point each `WAKE_POINT_SPACING` it sails while moving at
 *   `WAKE_MIN_SPEED` or more; a ship at rest lays none. The trail's newest
 *   end is the ship itself (its head), so the wake reaches the hull.
 * - Points age on the wave clock's step, so they freeze with it under
 *   reduced motion, when nothing new is laid either; they are dropped after
 *   `WAKE_LIFETIME_SECONDS`, and past `WAKE_MAX_LENGTH` of path behind the
 *   ship.
 * - All ships share `WAKE_POINT_BUDGET` points. Points are kept in the order
 *   they were laid, which is the order of their age, so when the budget is
 *   full the oldest point goes first, whichever ship laid it.
 * - The trail is kept in absolute world space: each new position is taken
 *   the short way round from the last on a wrapping map, so a ship crossing
 *   the east–west seam (whose canonical x jumps by the wrap width) leaves
 *   one unbroken wake. The water wraps each segment's distance as it does
 *   the hulls'.
 * - A jump longer than `WAKE_BREAK_DISTANCE` in one step (a ship placed
 *   anew) starts a fresh trail rather than drawing foam across the gap.
 * - A ship that leaves the registry (sunk, or gone) lays nothing more; its
 *   wake stays where it was and fades.
 *
 * Nothing allocates per frame: the points live in fixed typed arrays, and a
 * trail object is made only when a ship first sails.
 */
import type { ShipFoamRegistry, ShipFoamSource } from "../shipFoamSources";

/** Trail points all ships share; the water's uniform arrays hold this many segments. */
export const WAKE_POINT_BUDGET = 48;
/** Seconds a point lives: its foam has faded to nothing by then (wakeFoam.ts). */
export const WAKE_LIFETIME_SECONDS = 4.5;
/** World units sailed between points; the ships sail straight between hex centres, so few are needed. */
export const WAKE_POINT_SPACING = 0.3;
/** Longest trail kept behind a ship, world units of path: about four hexes. */
export const WAKE_MAX_LENGTH = 7;
/** Slowest speed (world units per second) that lays a trail. */
export const WAKE_MIN_SPEED = 0.2;
/** A step longer than this (world units) breaks the trail. */
export const WAKE_BREAK_DISTANCE = 1;
/** Floats per segment in the first array: newer end x, z, older end x, z. */
export const WAKE_FLOATS_A = 4;
/** Floats per segment in the second: newer end's age, older end's age, path astern of the bow at the newer end, beam. */
export const WAKE_FLOATS_B = 4;

interface Trail {
  /** Slot of the trail's newest point, −1 when it has none. */
  newest: number;
  /** The ship's position (its head), unwrapped onto the trail, and the age of that report. */
  headX: number;
  headZ: number;
  headAge: number;
  hasHead: boolean;
  halfLength: number;
  beam: number;
  /** Still reported by its ship. */
  live: boolean;
  /** Reported this update. */
  seen: boolean;
}

export interface WakeTrails {
  /**
   * Advance by a wave-clock step of `seconds` (nothing happens when it is 0:
   * frozen), then lay points for every ship in `ships` on a map that wraps
   * east–west every `wrapWidth` world units (0 when it does not wrap).
   */
  update: (seconds: number, ships: Pick<ShipFoamRegistry, "forEach">, wrapWidth: number) => void;
  /**
   * Writes the trails' segments, newest first in each trail, into `a`
   * (WAKE_FLOATS_A each) and `b` (WAKE_FLOATS_B each), and returns how many.
   * Never more than WAKE_POINT_BUDGET: each segment ends on a laid point.
   */
  fill: (a: Float32Array, b: Float32Array) => number;
  /** Points held, live or waiting at the back of the queue to be reused. */
  pointCount: () => number;
}

export function createWakeTrails(): WakeTrails {
  const capacity = WAKE_POINT_BUDGET;
  const px = new Float64Array(capacity);
  const pz = new Float64Array(capacity);
  const age = new Float64Array(capacity);
  /** Next older and next newer point of the same trail, −1 at its ends. */
  const older = new Int32Array(capacity).fill(-1);
  const newer = new Int32Array(capacity).fill(-1);
  /** The trail a slot belongs to; null once it is cut off its trail. */
  const owner: (Trail | null)[] = new Array<Trail | null>(capacity).fill(null);
  let start = 0;
  let count = 0;

  /** Every trail with a head or points; the live ones are also in `byId`. */
  const trails: Trail[] = [];
  const byId = new Map<string, Trail>();

  let wrap = 0;

  /** Cuts slot `s` off its trail: the trail ends at the next newer point. */
  const detach = (s: number) => {
    const trail = owner[s];
    if (!trail) return;
    const n = newer[s];
    if (n >= 0) older[n] = -1;
    if (trail.newest === s) trail.newest = -1;
    const o = older[s];
    if (o >= 0) newer[o] = -1;
    owner[s] = null;
    older[s] = -1;
    newer[s] = -1;
  };

  const dropOldest = () => {
    detach(start);
    start = (start + 1) % capacity;
    count--;
  };

  const push = (trail: Trail, x: number, z: number) => {
    if (count === capacity) dropOldest();
    const s = (start + count) % capacity;
    count++;
    px[s] = x;
    pz[s] = z;
    age[s] = 0;
    owner[s] = trail;
    older[s] = trail.newest;
    newer[s] = -1;
    if (trail.newest >= 0) newer[trail.newest] = s;
    trail.newest = s;
  };

  const newTrail = (): Trail => {
    const trail: Trail = {
      newest: -1,
      headX: 0,
      headZ: 0,
      headAge: 0,
      hasHead: false,
      halfLength: 0,
      beam: 0,
      live: true,
      seen: false,
    };
    trails.push(trail);
    return trail;
  };

  const lay = (source: ShipFoamSource, id: string) => {
    const moving = source.speed >= WAKE_MIN_SPEED;
    let trail = byId.get(id);
    if (!trail) {
      if (!moving) return;
      trail = newTrail();
      byId.set(id, trail);
    }
    let x = source.x;
    const z = source.z;
    if (trail.hasHead) {
      if (wrap > 0) x -= wrap * Math.round((x - trail.headX) / wrap);
      if (Math.hypot(x - trail.headX, z - trail.headZ) > WAKE_BREAK_DISTANCE) {
        // Leave the old trail to fade where it is and start afresh.
        trail.live = false;
        trail = newTrail();
        byId.set(id, trail);
        x = source.x;
      }
    }
    trail.seen = true;
    trail.live = true;
    trail.hasHead = true;
    trail.headX = x;
    trail.headZ = z;
    trail.headAge = 0;
    trail.halfLength = source.hullLength / 2;
    trail.beam = source.beam;
    if (!moving) return;
    const n = trail.newest;
    if (n < 0 || Math.hypot(x - px[n], z - pz[n]) >= WAKE_POINT_SPACING) push(trail, x, z);
  };

  /** Cuts the points past WAKE_MAX_LENGTH of path behind the head. */
  const trim = (trail: Trail) => {
    let path = 0;
    let x = trail.headX;
    let z = trail.headZ;
    for (let s = trail.newest; s >= 0; s = older[s]) {
      path += Math.hypot(px[s] - x, pz[s] - z);
      if (path > WAKE_MAX_LENGTH) {
        // Everything from here back leaves the trail.
        for (let t = s; t >= 0; ) {
          const next = older[t];
          detach(t);
          t = next;
        }
        return;
      }
      x = px[s];
      z = pz[s];
    }
  };

  /** Forgets a ship's id once its trail no longer follows it (made once, so the per-frame pass allocates nothing). */
  const forgetGone = (trail: Trail, id: string) => {
    if (!trail.live) byId.delete(id);
  };

  return {
    update: (seconds, ships, wrapWidth) => {
      if (!(seconds > 0)) return;
      wrap = wrapWidth > 0 && Number.isFinite(wrapWidth) ? wrapWidth : 0;
      for (let k = 0; k < count; k++) age[(start + k) % capacity] += seconds;
      while (count > 0 && (owner[start] === null || age[start] >= WAKE_LIFETIME_SECONDS)) dropOldest();
      for (let i = 0; i < trails.length; i++) {
        trails[i].headAge += seconds;
        trails[i].seen = false;
      }
      ships.forEach(lay);
      for (let i = trails.length - 1; i >= 0; i--) {
        const trail = trails[i];
        if (trail.live && !trail.seen) trail.live = false;
        trim(trail);
        if (!trail.live && trail.newest < 0) {
          trails[i] = trails[trails.length - 1];
          trails.pop();
        }
      }
      byId.forEach(forgetGone);
    },
    fill: (a, b) => {
      let n = 0;
      for (let i = 0; i < trails.length; i++) {
        const trail = trails[i];
        if (!trail.hasHead) continue;
        let ax = trail.headX;
        let az = trail.headZ;
        let ageA = trail.headAge;
        let path = trail.halfLength;
        for (let s = trail.newest; s >= 0 && n < capacity; s = older[s]) {
          a[n * WAKE_FLOATS_A] = ax;
          a[n * WAKE_FLOATS_A + 1] = az;
          a[n * WAKE_FLOATS_A + 2] = px[s];
          a[n * WAKE_FLOATS_A + 3] = pz[s];
          b[n * WAKE_FLOATS_B] = ageA;
          b[n * WAKE_FLOATS_B + 1] = age[s];
          b[n * WAKE_FLOATS_B + 2] = path;
          b[n * WAKE_FLOATS_B + 3] = trail.beam;
          n++;
          path += Math.hypot(px[s] - ax, pz[s] - az);
          ax = px[s];
          az = pz[s];
          ageA = age[s];
        }
      }
      return n;
    },
    pointCount: () => count,
  };
}
