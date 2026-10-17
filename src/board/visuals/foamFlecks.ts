/**
 * The ships' foam flecks (#389): small bits of foam and bubbles a hull sheds
 * along its waterline, drawn as particles riding the sea instead of a white
 * patch painted round the hull. Pure; `ShipFoamFlecks.tsx` steps them once a
 * frame and draws them in one instanced call for every ship.
 *
 * - **Where:** each fleck starts just outside the waterline (a hull of the
 *   registered length and beam, narrowing to its stem and stern), on either
 *   side; under way most come off the bow, where the hull pushes the water
 *   aside, at anchor from all along it, slapping against the hull.
 * - **How many:** a sparse few a second at anchor, many under way, full at
 *   the hull foam's full speed (`fleckSpawnRate`).
 * - **How they move:** they are born moving out from the hull (and a little
 *   forward off the bow) and slow in the water (`FLECK_DRAG`), so as the
 *   ship sails on they fall astern of it. They are not carried along with
 *   the hull: the speed the registry reports eases off after a move
 *   (Ship.tsx), and a carry would throw them ahead of a ship that has
 *   stopped. They fade in, then out over their
 *   life, shorter under way than at anchor.
 * - **On the sea:** the writer puts each one on the CPU sea surface where it
 *   is drawn (ADR 0004, `seaSurface.ts`), in the copy of the wrapping world
 *   nearest the camera, so they never float over or sink under the swell.
 * - **Close up only:** they are drawn at the close-up weight (closeFoam.ts),
 *   so the opening ship view, mid and map zoom draw none.
 *
 * Time is the wave clock's step: it freezes under reduced motion, when
 * nothing new is shed and nothing moves, as the wake trail does
 * (wakeTrail.ts). Each ship draws from its own seeded stream (ADR 0007), so
 * there is no `Math.random`.
 */
import { createPool, envelope, type ParticlePool } from "../combatFx/particlePool";
import { closeFoamWeight } from "./closeFoam";
import type { SeaSurface } from "./seaSurface";
import { waveTimeStep } from "./waveClock";
import type { ShipFoamRegistry, ShipFoamSource } from "../shipFoamSources";
import { HULL_FOAM_FULL_SPEED } from "./hullFoam";
import { SEED_FEATURES } from "./seedFeatures";
import { stream, subSeed } from "./subSeed";

/** Flecks a second a ship sheds at anchor ... */
export const FLECK_RATE_ANCHOR = 3;
/** ... and at full speed (HULL_FOAM_FULL_SPEED) and over. */
export const FLECK_RATE_UNDERWAY = 90;
/** A fleck's life, seconds, at anchor and under way. */
export const FLECK_LIFE_ANCHOR: readonly [number, number] = [2.2, 3.6];
export const FLECK_LIFE_UNDERWAY: readonly [number, number] = [0.9, 1.9];
/** STYLISTIC: a fleck's size (world units across), smallest and largest. */
export const FLECK_SIZE: readonly [number, number] = [0.004, 0.011];
/** STYLISTIC: how much a fleck spreads as it ages (share of its size by the end of its life). */
export const FLECK_GROW = 0.6;
/** Share of the flecks that come off the bow at full speed. */
export const FLECK_BOW_SHARE = 0.65;
/** Where the bow's share starts, as a share of the half length forward of amidships. */
export const FLECK_BOW_START = 0.4;
/** STYLISTIC: how far outside the waterline a fleck starts, in half beams: at least, and at most. */
export const FLECK_OFFSET: readonly [number, number] = [0.05, 0.35];
/** STYLISTIC: how fast a fleck is pushed out from the hull, world units a second, at rest and the gain at full speed. */
export const FLECK_OUT_SPEED = 0.03;
export const FLECK_OUT_GAIN = 0.12;
/** How fast the water slows a fleck, 1/s. */
export const FLECK_DRAG = 1.6;
/** STYLISTIC: a fleck's opacity at full close-up weight, and its fade in and out (shares of its life). */
export const FLECK_OPACITY = 0.75;
export const FLECK_FADE_IN = 0.1;
export const FLECK_FADE_OUT = 0.6;

const lerp = ([lo, hi]: readonly [number, number], t: number) => lo + (hi - lo) * t;
const motionAt = (speed: number) => Math.min(1, Math.max(0, speed) / HULL_FOAM_FULL_SPEED);

/** Flecks a second shed by a ship at `speed` (world units a second). */
export function fleckSpawnRate(speed: number): number {
  return FLECK_RATE_ANCHOR + (FLECK_RATE_UNDERWAY - FLECK_RATE_ANCHOR) * motionAt(speed);
}

/** The waterline's half width at `alongShare` of the half length from amidships (−1 stern … 1 stem): full amidships, nothing at the ends. */
export function waterlineHalfBeam(alongShare: number, halfBeam: number): number {
  const u = Math.min(1, Math.abs(alongShare));
  return halfBeam * Math.sqrt(Math.max(0, 1 - u ** 4));
}

/** A fleck as it is shed, in the hull's frame: along the heading and across it, from the ship's position. */
export interface FleckSpawn {
  along: number;
  across: number;
  /** Its velocity through the water, world units a second, in the same frame (before the carry). */
  vAlong: number;
  vAcross: number;
  life: number;
  size: number;
  seed: number;
}

/** A fleck shed by a hull of `halfLength` and `halfBeam` at `motion` (0 at rest … 1 full speed), drawn from `random`. */
export function fleckSpawn(random: () => number, { halfLength, halfBeam }: { halfLength: number; halfBeam: number }, motion: number): FleckSpawn {
  const side = random() < 0.5 ? -1 : 1;
  const bow = random() < FLECK_BOW_SHARE * motion;
  const u = bow ? FLECK_BOW_START + (1 - FLECK_BOW_START) * random() : 2 * random() - 1;
  const edge = waterlineHalfBeam(u, halfBeam);
  const across = side * (edge + lerp(FLECK_OFFSET, random()) * halfBeam);
  const out = (FLECK_OUT_SPEED + FLECK_OUT_GAIN * motion) * (0.5 + random());
  // Off the bow the water is pushed forward as well as out.
  const forward = u > FLECK_BOW_START ? out * (u - FLECK_BOW_START) : 0;
  return {
    along: u * halfLength,
    across,
    vAlong: forward,
    vAcross: side * out,
    // Its life range slides from the anchor's to the under way one's with the motion.
    life: lerp(
      [FLECK_LIFE_ANCHOR[0] + (FLECK_LIFE_UNDERWAY[0] - FLECK_LIFE_ANCHOR[0]) * motion, FLECK_LIFE_ANCHOR[1] + (FLECK_LIFE_UNDERWAY[1] - FLECK_LIFE_ANCHOR[1]) * motion],
      random()
    ),
    size: lerp(FLECK_SIZE, random()),
    seed: random(),
  };
}

/** The world xz of the point `along` the heading and `across` it from the ship's position, into `out`. */
export function hullFrameToWorld(along: number, across: number, ship: Pick<ShipFoamSource, "x" | "z" | "headingX" | "headingZ">, out: [number, number]): void {
  out[0] = ship.x + along * ship.headingX - across * ship.headingZ;
  out[1] = ship.z + along * ship.headingZ + across * ship.headingX;
}

export interface FleckEmitters {
  /** Sheds `dt` seconds' worth of flecks (wave-clock time: 0 when frozen) from every ship in `ships` into `pool`. */
  emit: (dt: number, ships: Pick<ShipFoamRegistry, "forEach">, pool: ParticlePool) => void;
}

interface Emitter {
  random: () => number;
  carry: number;
  seen: boolean;
}

/** One emitter per ship, each on its own stream of the world seed, made when the ship first registers and dropped when it leaves. */
export function createFleckEmitters(worldSeed: number): FleckEmitters {
  const emitters = new Map<string, Emitter>();
  const at: [number, number] = [0, 0];
  const hull = { halfLength: 0, halfBeam: 0 };
  return {
    emit: (dt, ships, pool) => {
      if (dt <= 0) return;
      emitters.forEach((e) => (e.seen = false));
      ships.forEach((ship, id) => {
        let e = emitters.get(id);
        if (!e) {
          const random = stream(subSeed(worldSeed, SEED_FEATURES.shipFoamFlecks, id));
          e = { random, carry: random(), seen: true };
          emitters.set(id, e);
        }
        e.seen = true;
        if (ship.hullLength <= 0) return;
        const motion = motionAt(ship.speed);
        hull.halfLength = ship.hullLength / 2;
        hull.halfBeam = ship.beam / 2;
        e.carry += fleckSpawnRate(ship.speed) * dt;
        while (e.carry >= 1) {
          e.carry -= 1;
          const f = fleckSpawn(e.random, hull, motion);
          hullFrameToWorld(f.along, f.across, ship, at);
          const i = pool.next;
          pool.next = (i + 1) % pool.capacity;
          pool.px[i] = at[0];
          pool.py[i] = 0;
          pool.pz[i] = at[1];
          pool.vx[i] = f.vAlong * ship.headingX - f.vAcross * ship.headingZ;
          pool.vy[i] = 0;
          pool.vz[i] = f.vAlong * ship.headingZ + f.vAcross * ship.headingX;
          pool.age[i] = 0;
          pool.life[i] = f.life;
          pool.size[i] = f.size;
          pool.rot[i] = 0;
          pool.spin[i] = 0;
          pool.seed[i] = f.seed;
          pool.state[i] = 2;
        }
      });
      emitters.forEach((e, id) => {
        if (!e.seen) emitters.delete(id);
      });
    },
  };
}

/** Ages every fleck by `dt` seconds, slows it in the water and moves it on; a fleck past its life goes. */
export function stepFlecks(pool: ParticlePool, dt: number): void {
  if (dt <= 0) return;
  const keep = Math.exp(-FLECK_DRAG * dt);
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.state[i] === 0) continue;
    pool.age[i] += dt;
    if (pool.age[i] >= pool.life[i]) {
      pool.state[i] = 0;
      continue;
    }
    pool.vx[i] *= keep;
    pool.vz[i] *= keep;
    pool.px[i] += pool.vx[i] * dt;
    pool.pz[i] += pool.vz[i] * dt;
  }
}

/** The instance arrays the flecks are written into: xyz offset, size, alpha and a seed per fleck. */
export interface FleckTarget {
  offset: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  seed: Float32Array;
}

export interface FleckView {
  /** The close-up weight (closeFoam.ts): 0 draws nothing. */
  weight: number;
  /** The camera's focus x: each fleck is drawn in the copy of the world nearest it. */
  focusX: number;
  /** The map's wrap width, 0 where it does not wrap. */
  wrap: number;
  /** The sea's height at a drawn world (x, z) (the CPU swell at the wave clock's time). */
  seaHeight: (x: number, z: number) => number;
}

/** Packs the live flecks into `target`, each on the sea where it is drawn; returns how many. */
export function writeFlecks(pool: ParticlePool, target: FleckTarget, { weight, focusX, wrap, seaHeight }: FleckView): number {
  if (weight <= 0) return 0;
  const room = Math.min(pool.capacity, target.size.length);
  let n = 0;
  for (let i = 0; i < pool.capacity && n < room; i++) {
    if (pool.state[i] === 0) continue;
    const x = wrap > 0 ? pool.px[i] - wrap * Math.round((pool.px[i] - focusX) / wrap) : pool.px[i];
    const z = pool.pz[i];
    const s = pool.age[i] / pool.life[i];
    target.offset[3 * n] = x;
    target.offset[3 * n + 1] = seaHeight(x, z);
    target.offset[3 * n + 2] = z;
    target.size[n] = pool.size[i] * (1 + FLECK_GROW * s);
    target.alpha[n] = FLECK_OPACITY * envelope(s, FLECK_FADE_IN, FLECK_FADE_OUT) * Math.min(1, weight);
    target.seed[n] = pool.seed[i];
    n++;
  }
  return n;
}

/** What a frame of the flecks reads: the wave clock, the camera and the sea, and the ships. */
export interface FleckFrameInput {
  /** The wave clock's time this frame, or null without a sea. */
  waveTime: number | null;
  camera: readonly [number, number, number];
  /** The camera's focus x (each fleck is drawn in the copy nearest it) and its distance from the focus (the close-up weight). */
  focusX: number;
  cameraDistance: number;
  /** The map's wrap width, 0 where it does not wrap. */
  wrap: number;
  surface: Pick<SeaSurface, "heightAt"> | null;
  ships: Pick<ShipFoamRegistry, "forEach">;
}

export interface FleckFrame {
  /** Sheds and steps the flecks on the wave clock's step since the last frame, then writes them into `target`; returns how many to draw. */
  update: (input: FleckFrameInput, target: FleckTarget) => number;
}

/** The flecks of every ship, in one pool of `capacity` (the oldest goes first when full), on streams of `worldSeed`. */
export function createFleckFrame(worldSeed: number, capacity: number): FleckFrame {
  const pool = createPool(capacity);
  const emitters = createFleckEmitters(worldSeed);
  const eye: [number, number, number] = [0, 0, 0];
  let lastWaveTime: number | null = null;
  let seconds = 0;
  let surface: FleckFrameInput["surface"] = null;
  const view: FleckView = {
    weight: 0,
    focusX: 0,
    wrap: 0,
    seaHeight: (x, z) => (surface ? surface.heightAt(x, z, seconds, eye) : 0),
  };
  return {
    update: (input, target) => {
      const step = input.waveTime !== null && lastWaveTime !== null ? waveTimeStep(lastWaveTime, input.waveTime) : 0;
      lastWaveTime = input.waveTime;
      emitters.emit(step, input.ships, pool);
      stepFlecks(pool, step);
      surface = input.waveTime !== null ? input.surface : null;
      seconds = input.waveTime ?? 0;
      eye[0] = input.camera[0];
      eye[1] = input.camera[1];
      eye[2] = input.camera[2];
      view.weight = closeFoamWeight(input.cameraDistance);
      view.focusX = input.focusX;
      view.wrap = input.wrap;
      return writeFlecks(pool, target, view);
    },
  };
}
