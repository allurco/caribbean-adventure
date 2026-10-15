/**
 * Combat effects (#263, from the #259 lab): a fixed pool of particles in
 * typed arrays, stepped in place, so the effects allocate nothing per frame.
 * One pool per kind of effect (smoke, muzzle flash, spray, splinters,
 * crates); the kind says how its particles move:
 *
 * - drag pulls a particle's velocity toward the wind's drift (`windFollow`
 *   of it) and its rise or fall toward rest;
 * - gravity pulls it down (negative: it rises, as warm smoke does);
 * - at the sea surface it passes through, dies (spray) or floats, riding the
 *   swell and drifting (splinters, crates).
 *
 * World units; the sea height is a function the caller gives (the scene's
 * `seaSurface.heightAt` at the wave clock's time, ADR 0004).
 */

export interface ParticleKind {
  /** Downward pull, world units/s² (negative rises). */
  readonly gravity: number;
  /** How fast velocity relaxes toward the drift, 1/s. */
  readonly drag: number;
  /** Share of the wind's drift the particle is carried at. */
  readonly windFollow: number;
  /** What the sea surface does to it. */
  readonly onSea: "pass" | "die" | "float";
  /** Default lifetime, s. */
  readonly life: number;
  /** The highest it rises above the sea surface, world units: powder smoke held in a low bank. */
  readonly ceiling?: number;
}

export interface SeaEnvironment {
  /** The wind's drift, world units/s, along x and z. */
  windX: number;
  windZ: number;
  seaHeight: (x: number, z: number) => number;
}

export interface ParticlePool {
  readonly capacity: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  /** Spin angle and rate (radians, rad/s), for tumbling debris. */
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  /** A per-particle number in [0, 1), for variety in the look. */
  readonly seed: Float32Array;
  /** 1 while alive; 2 once floating. */
  readonly state: Uint8Array;
  /** The slot the next spawn takes. */
  next: number;
}

export interface SpawnParams {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life?: number;
  spin?: number;
  seed?: number;
}

export function createPool(capacity: number): ParticlePool {
  const f = () => new Float32Array(capacity);
  return {
    capacity,
    px: f(), py: f(), pz: f(), vx: f(), vy: f(), vz: f(),
    age: f(), life: f(), size: f(), rot: f(), spin: f(), seed: f(),
    state: new Uint8Array(capacity),
    next: 0,
  };
}

/** Starts a particle in the next slot, the oldest one when the pool is full. */
export function spawn(pool: ParticlePool, kind: ParticleKind, p: SpawnParams): void {
  const i = pool.next;
  pool.next = (i + 1) % pool.capacity;
  pool.px[i] = p.x; pool.py[i] = p.y; pool.pz[i] = p.z;
  pool.vx[i] = p.vx; pool.vy[i] = p.vy; pool.vz[i] = p.vz;
  pool.age[i] = 0;
  pool.life[i] = p.life ?? kind.life;
  pool.size[i] = p.size;
  pool.rot[i] = 0;
  pool.spin[i] = p.spin ?? 0;
  pool.seed[i] = p.seed ?? 0;
  pool.state[i] = 1;
}

/** Advances every live particle by `dt` seconds. */
export function stepPool(pool: ParticlePool, kind: ParticleKind, dt: number, env: SeaEnvironment): void {
  const relax = 1 - Math.exp(-kind.drag * dt);
  const driftX = env.windX * kind.windFollow;
  const driftZ = env.windZ * kind.windFollow;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.state[i] === 0) continue;
    const age = (pool.age[i] += dt);
    if (age >= pool.life[i]) {
      pool.state[i] = 0;
      continue;
    }
    pool.vx[i] += (driftX - pool.vx[i]) * relax;
    pool.vz[i] += (driftZ - pool.vz[i]) * relax;
    pool.px[i] += pool.vx[i] * dt;
    pool.pz[i] += pool.vz[i] * dt;
    if (pool.state[i] === 2) {
      // Floating: it rides the swell; its spin dies away.
      pool.py[i] = env.seaHeight(pool.px[i], pool.pz[i]);
      pool.spin[i] *= 1 - relax;
      pool.rot[i] += pool.spin[i] * dt;
      continue;
    }
    pool.vy[i] -= pool.vy[i] * relax + kind.gravity * dt;
    pool.py[i] += pool.vy[i] * dt;
    pool.rot[i] += pool.spin[i] * dt;
    if (kind.ceiling !== undefined) {
      const top = env.seaHeight(pool.px[i], pool.pz[i]) + kind.ceiling;
      if (pool.py[i] > top) {
        pool.py[i] = top;
        if (pool.vy[i] > 0) pool.vy[i] = 0;
      }
    }
    if (kind.onSea === "pass" || pool.vy[i] > 0) continue;
    const sea = env.seaHeight(pool.px[i], pool.pz[i]);
    if (pool.py[i] > sea) continue;
    if (kind.onSea === "die") pool.state[i] = 0;
    else {
      pool.state[i] = 2;
      pool.py[i] = sea;
      pool.vy[i] = 0;
    }
  }
}

export function aliveCount(pool: ParticlePool): number {
  let n = 0;
  for (let i = 0; i < pool.capacity; i++) if (pool.state[i] !== 0) n++;
  return n;
}

/** Opacity over a life's share `s` in [0, 1]: up over `fadeIn`, down over the last `fadeOut`. */
export function envelope(s: number, fadeIn: number, fadeOut: number): number {
  if (s <= 0 || s >= 1) return 0;
  const up = fadeIn > 0 ? Math.min(1, s / fadeIn) : 1;
  const down = fadeOut > 0 ? Math.min(1, (1 - s) / fadeOut) : 1;
  return Math.min(up, down);
}
