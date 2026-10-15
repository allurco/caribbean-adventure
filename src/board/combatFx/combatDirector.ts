/**
 * Plays the fight on the board (#263). It runs the combat timeline's beats
 * through the one cue player (cuePlayer.ts) and, for each cue, moves the
 * ships (through combatShipPoses.ts, which Ship.tsx draws), fills the
 * effect pools, flies the shots and grapples, asks the camera to frame the
 * fight, and plays each cue's sound at the place it happens. The visuals and
 * the sounds come from the same cue on the same frame, so they never drift.
 *
 * No React here: the effect components read the pools and draw them. Every
 * pool, shot and grapple is allocated up front and written in place, so a
 * frame allocates nothing (a cue, a handful of times a second, may).
 * Cosmetic only: nothing here reads or writes `G`, and its randomness is a
 * seeded stream (ADR 0007).
 *
 * Positions are in the canonical copy of the world (where Ship.tsx's poses
 * are); `copyX` is the offset of the copy the camera is in, which the effect
 * layer and the sounds add.
 */
import { Matrix4, Vector3, type Object3D } from "three";
import type { ShipClass } from "../../game/types";
import type { SoundId } from "../../audio/soundRegistry";
import { beatProgress, easeInOutSine, framePoints, sinkPose } from "./beatTiming";
import { aimPoint, gunForShot, gunsOnSide, lurchRoll, muzzleOf, recoilRoll, shotArc, type TargetSize, type Vec3 } from "./broadside";
import { createCuePlayer, GRAPPLES_AT, type CombatCue } from "./cuePlayer";
import { cueSound } from "./cueSounds";
import type { CombatBeat } from "./combatTimeline";
import type { CombatShipPoses, HeldPose } from "./combatShipPoses";
import { createPool, spawn, stepPool, type ParticleKind, type ParticlePool, type SeaEnvironment } from "./particlePool";
import { CLOSE_IN_APPROACH_GAP, closeInPath, headingBefore, forward, pathPose, sharedBeamHeading, sideOf, starboard, turnHeading, type ShipPath } from "./shipPaths";
import { shipGuns, shipSize } from "./shipGuns";
import { stream } from "../visuals/variationStream";
import { subSeed } from "../visuals/subSeed";
import { SEED_FEATURES } from "../visuals/seedFeatures";

/** How each effect's particles move (particlePool.ts). World units and seconds. */
export const KINDS = {
  // Powder smoke: blown out of the ports, then held in a low bank on the water, drifting downwind.
  smoke: { gravity: -0.01, drag: 1.3, windFollow: 1, onSea: "pass", life: 22, ceiling: 0.1 },
  flash: { gravity: 0, drag: 6, windFollow: 0, onSea: "pass", life: 0.4 },
  // Hot sparks out of the muzzle and off a hit: they arc down under gravity and die in the air or the sea.
  spark: { gravity: 2.2, drag: 0.9, windFollow: 0.15, onSea: "die", life: 0.6 },
  // A few embers lifting out of the smoke for a moment, carried by the wind.
  ember: { gravity: -0.06, drag: 1.5, windFollow: 1, onSea: "pass", life: 1.6 },
  spray: { gravity: 2.6, drag: 0.35, windFollow: 0.2, onSea: "die", life: 2.5 },
  mist: { gravity: -0.01, drag: 2.5, windFollow: 0.6, onSea: "pass", life: 2.4, ceiling: 0.16 },
  splinter: { gravity: 2.6, drag: 0.3, windFollow: 0.1, onSea: "float", life: 14 },
  // Foam where a ship goes down: it lies on the swell, spreads a little, and fades.
  foam: { gravity: 0, drag: 1.5, windFollow: 0.25, onSea: "float", life: 6 },
} as const satisfies Record<string, ParticleKind>;
export type PoolName = keyof typeof KINDS;

const CAPACITY: Record<PoolName, number> = { smoke: 720, flash: 48, spark: 480, ember: 96, spray: 640, mist: 160, splinter: 320, foam: 240 };
const SHOT_CAPACITY = 48;
const GRAPPLE_COUNT = 5;
const IMPULSES = 8;

/** How far a fleeing ship runs downwind, world units: off its station, still within its hex. */
export const FLEE_RUN = 0.7;
/** The gap the grapples haul two ships to, world units. */
export const HAULED_GAP = 0.035;
/** Seconds the ships are held after the last beat of a finished fight, before their own sailing takes over. */
const RELEASE_DELAY = 1.5;
/** How far a sinking ship goes down, as a share of her masthead's height: just past it. */
const SINK_PAST_MASTHEAD = 1.15;
/** Extra room round the framed fight, for the HUD over the scene (the combat panel, the ship card). */
const CAMERA_ROOM = 1.3;
/** How long a banner (escaped, caught) stays up, s. */
const BANNER_SECONDS = 2.4;

export interface Shot {
  active: boolean;
  key: number;
  from: Vector3;
  to: Vector3;
  start: number;
  seconds: number;
  arc: number;
  hit: boolean;
  pos: Vector3;
}

export interface Grapple {
  active: boolean;
  /** Points on the thrower's rail and the target's, in each ship's frame. */
  from: Vec3;
  to: Vec3;
  throwAt: number;
  flight: number;
}

interface ShipFx {
  id: string;
  shipClass: ShipClass | undefined;
  size: TargetSize;
  held: HeldPose;
  turn: { from: number; to: number; start: number; seconds: number } | null;
  path: { path: ShipPath; start: number; seconds: number; heel: number } | null;
  /** Hauled sideways by the grapples, without turning. */
  haul: { start: number; seconds: number; x: number; z: number; dx: number; dz: number } | null;
  recoilAt: Float32Array;
  recoilSide: Int8Array;
  lurchAt: Float32Array;
  lurchSide: Int8Array;
  impulse: number;
  sink: { start: number; seconds: number; side: 1 | -1; foamDue: number } | null;
}

export interface CameraView {
  target: [number, number, number];
  distance: number;
}

export interface CombatDirectorOptions {
  poses: CombatShipPoses;
  /** The world seed: the effects' variety is drawn from it. */
  seed: number;
  playSound?: (id: SoundId, at: readonly [number, number, number]) => void;
  onBanner?: (text: string | null) => void;
}

export interface CombatDirector {
  readonly pools: Record<PoolName, ParticlePool>;
  readonly shots: readonly Shot[];
  readonly grapples: readonly Grapple[];
  /** The ids of the grapples' thrower and target. */
  grappling: { from: string; to: string } | null;
  /** The offset of the copy of the world the camera is in (WorldCopies.tsx). */
  copyX: number;
  /** A fight is on the board: beats to play, or ships still held. */
  holding: () => boolean;
  /** Seconds since the director started: the clock its effects are timed on. */
  time: () => number;
  enqueue: (beats: readonly CombatBeat[], classes: Readonly<Record<string, ShipClass | undefined>>) => void;
  setFightOn: (on: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  /** The camera's field of view and the screen's aspect, for framing the fight. */
  setView: (fovDeg: number, aspect: number) => void;
  /** The framing asked for since the last call, once. */
  takeCameraRequest: () => CameraView | null;
  /** A ship's frame in world space (canonical copy), written to `out`: through its drawn model when there is one. */
  shipMatrix: (id: string, out: Matrix4) => boolean;
  update: (dt: number, env: SeaEnvironment) => void;
}

export function createCombatDirector({ poses, seed, playSound, onBanner }: CombatDirectorOptions): CombatDirector {
  const pools = Object.fromEntries((Object.keys(KINDS) as PoolName[]).map((name) => [name, createPool(CAPACITY[name])])) as Record<PoolName, ParticlePool>;
  const shots: Shot[] = Array.from({ length: SHOT_CAPACITY }, () => ({
    active: false,
    key: -1,
    from: new Vector3(),
    to: new Vector3(),
    start: 0,
    seconds: 1,
    arc: 0,
    hit: false,
    pos: new Vector3(),
  }));
  const grapples: Grapple[] = Array.from({ length: GRAPPLE_COUNT }, () => ({
    active: false,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    throwAt: 0,
    flight: 0.7,
  }));
  const player = createCuePlayer();
  const ships = new Map<string, ShipFx>();
  // Each beat draws from its own stream, named by the beat (its seedKey), so its variety is the same on every seat.
  let random = stream(subSeed(seed, SEED_FEATURES.combatEffects, "start"));
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const matrix = new Matrix4();
  const at3: [number, number, number] = [0, 0, 0];
  let classes: Readonly<Record<string, ShipClass | undefined>> = {};
  let env: SeaEnvironment = { windX: 0, windZ: 0, seaHeight: () => 0 };
  let fightOn = false;
  let reduced = false;
  let quietSince = 0;
  let view = { fovDeg: 45, aspect: 1.6 };
  let cameraRequest: CameraView | null = null;
  let bannerUntil = -1;

  const director: CombatDirector = {
    pools,
    shots,
    grapples,
    grappling: null,
    copyX: 0,
    time: () => player.time(),
    holding: () => player.busy() || ships.size > 0,
    enqueue: (beats, shipClasses) => {
      classes = { ...classes, ...shipClasses };
      player.enqueue(beats);
    },
    setFightOn: (on) => {
      fightOn = on;
    },
    setReducedMotion: (on) => {
      reduced = on;
    },
    setView: (fovDeg, aspect) => {
      view = { fovDeg, aspect };
    },
    takeCameraRequest: () => {
      const request = cameraRequest;
      cameraRequest = null;
      return request;
    },
    shipMatrix: (id, out) => {
      const fx = ships.get(id);
      return fx ? frameOf(fx, out) : false;
    },
    update,
  };

  const now = () => player.time();

  /** The fight's hold on ship `id`, taken the first time a cue needs it. */
  function shipFx(id: string): ShipFx | null {
    let fx = ships.get(id);
    if (fx && !fx.held.gone) return fx;
    if (fx) {
      // That ship went down; this is a seat's fresh one under the same id (#277).
      poses.release(id);
      ships.delete(id);
    }
    const reported = poses.reported(id);
    if (!reported) return null;
    director.copyX = reported.copyX;
    const shipClass = classes[id];
    fx = {
      id,
      shipClass,
      size: shipSize(shipClass),
      held: poses.hold(id, reported),
      turn: null,
      path: null,
      haul: null,
      recoilAt: new Float32Array(IMPULSES).fill(-1e9),
      recoilSide: new Int8Array(IMPULSES).fill(1),
      lurchAt: new Float32Array(IMPULSES).fill(-1e9),
      lurchSide: new Int8Array(IMPULSES).fill(1),
      impulse: 0,
      sink: null,
    };
    ships.set(id, fx);
    return fx;
  }

  /** A ship's frame in the canonical copy: its drawn model's (under its wave pose) when there is one, else its held pose. */
  function frameOf(fx: ShipFx, out: Matrix4): boolean {
    const reported = poses.reported(fx.id);
    const anchor: Object3D | null | undefined = reported?.anchor;
    if (anchor && !fx.held.gone) {
      out.copy(anchor.matrixWorld);
      // Back from the copy it was drawn in to the canonical one.
      out.elements[12] -= reported!.copyX;
      return true;
    }
    out.makeRotationY(fx.held.heading).setPosition(fx.held.x, -fx.held.drop, fx.held.z);
    return true;
  }

  function toWorld(fx: ShipFx, p: Vec3, out: Vector3): Vector3 {
    frameOf(fx, matrix);
    return out.set(p.x, p.y, p.z).applyMatrix4(matrix);
  }

  function sound(id: SoundId | null, x: number, y: number, z: number): void {
    if (!id || !playSound) return;
    at3[0] = x + director.copyX;
    at3[1] = y;
    at3[2] = z;
    playSound(id, at3);
  }

  function banner(text: string): void {
    bannerUntil = now() + BANNER_SECONDS;
    onBanner?.(text);
  }

  const driftAlong = (): [number, number] => {
    const length = Math.hypot(env.windX, env.windZ) || 1;
    return [env.windX / length, env.windZ / length];
  };

  /** Asks for a view of the fight; under reduced motion the board cuts to it rather than flying (cameraFlight.ts, #229). */
  function frameCamera(points: readonly { x: number; z: number }[], shipLength: number): void {
    const frame = framePoints(points, { ...view, shipLength });
    cameraRequest = { target: [frame.target[0] + director.copyX, frame.target[1], frame.target[2]], distance: frame.distance * CAMERA_ROOM };
  }

  function turnTo(fx: ShipFx, heading: number, seconds: number): void {
    fx.path = null;
    fx.turn = { from: fx.held.heading, to: heading, start: now(), seconds: Math.max(0.01, seconds) };
  }

  function setPath(fx: ShipFx, path: ShipPath, seconds: number): void {
    fx.turn = null;
    fx.path = { path, start: now(), seconds, heel: 0 };
  }

  /** Both ships laid beam-on to each other on one heading. */
  function engage(a: ShipFx, b: ShipFx, seconds: number): void {
    const heading = sharedBeamHeading(a.held, b.held);
    turnTo(a, heading, seconds);
    turnTo(b, heading, seconds);
  }

  function push(fx: ShipFx, which: "recoil" | "lurch", side: 1 | -1, delay = 0): void {
    const i = fx.impulse;
    fx.impulse = (i + 1) % IMPULSES;
    if (which === "recoil") {
      fx.recoilAt[i] = now() + delay;
      fx.recoilSide[i] = side;
    } else {
      fx.lurchAt[i] = now() + delay;
      fx.lurchSide[i] = side;
    }
  }

  function burst(pool: PoolName, at: Vector3, count: number, speed: number, up: number, size: number, spin = 0): void {
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + 0.6 * random());
      spawn(pools[pool], KINDS[pool], {
        x: at.x, y: at.y, z: at.z,
        vx: Math.cos(a) * v, vy: up * (0.5 + random()), vz: Math.sin(a) * v,
        size: size * (0.6 + 0.8 * random()),
        spin: (random() - 0.5) * spin,
        seed: random(),
      });
    }
  }

  /** A column of spray where something strikes the sea. */
  function splash(at: Vector3, scale: number): void {
    const sea = env.seaHeight(at.x, at.z);
    for (let k = 0; k < Math.round(16 * scale); k++) {
      const a = random() * Math.PI * 2;
      const r = random() * 0.025 * scale;
      spawn(pools.spray, KINDS.spray, {
        x: at.x + Math.cos(a) * r, y: sea + 0.005, z: at.z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.12 * scale * random(), vy: (0.55 + 0.6 * random()) * Math.sqrt(scale), vz: Math.sin(a) * 0.12 * scale * random(),
        size: 0.012 + 0.012 * random(),
        seed: random(),
      });
    }
    tmp2.set(at.x, sea, at.z);
    burst("mist", tmp2, Math.round(3 * scale), 0.12 * scale, 0.05, 0.05 * scale);
  }

  /**
   * The gun's flash, and its smoke: blown out of the port along the water,
   * spread along the side so a broadside's smoke runs together into a low
   * wall that the wind then carries off.
   */
  function gunSmoke(fx: ShipFx, muzzle: Vector3, side: 1 | -1): void {
    const [sx, sz] = starboard(fx.held.heading);
    const [kx, kz] = forward(fx.held.heading);
    const ox = side * sx, oz = side * sz;
    spawn(pools.flash, KINDS.flash, { x: muzzle.x + ox * 0.015, y: muzzle.y, z: muzzle.z + oz * 0.015, vx: ox * 0.3, vy: 0, vz: oz * 0.3, size: 0.12 + 0.05 * random(), seed: random() });
    sparkBurst(muzzle, ox, oz, reduced ? 5 : 14, 0.9);
    for (let k = 0; k < (reduced ? 1 : 3); k++) {
      spawn(pools.ember, KINDS.ember, {
        x: muzzle.x + ox * 0.03, y: muzzle.y, z: muzzle.z + oz * 0.03,
        vx: ox * (0.1 + 0.2 * random()), vy: 0.05 + 0.08 * random(), vz: oz * (0.1 + 0.2 * random()),
        size: 0.008 + 0.006 * random(),
        life: (reduced ? 0.8 : 1.2) + 0.8 * random(),
        seed: random(),
      });
    }
    const life = reduced ? 7 : 16;
    for (let k = 0; k < 14; k++) {
      const out = 0.12 + 0.8 * random();
      const along = (random() - 0.5) * 0.2;
      spawn(pools.smoke, KINDS.smoke, {
        x: muzzle.x + kx * along, y: muzzle.y - 0.01 * random(), z: muzzle.z + kz * along,
        vx: ox * out + kx * (random() - 0.5) * 0.15,
        vy: 0.02 * random(),
        vz: oz * out + kz * (random() - 0.5) * 0.15,
        size: 0.045 + 0.04 * random(),
        life: life + 6 * random(),
        seed: random(),
      });
    }
  }

  /** Sparks thrown out along (ox, oz) from `at`, fanning and arcing down; `speed` scales their throw. */
  function sparkBurst(at: Vector3, ox: number, oz: number, count: number, speed: number): void {
    for (let k = 0; k < count; k++) {
      const v = speed * (0.4 + 0.9 * random());
      const fan = (random() - 0.5) * 0.9;
      spawn(pools.spark, KINDS.spark, {
        x: at.x, y: at.y, z: at.z,
        vx: (ox - oz * fan) * v, vy: 0.15 + 0.5 * random(), vz: (oz + ox * fan) * v,
        size: 0.007 + 0.009 * random(),
        life: (reduced ? 0.2 : 0.35) + (reduced ? 0.15 : 0.35) * random(),
        seed: random(),
      });
    }
  }

  function freeShot(): Shot {
    return shots.find((s) => !s.active) ?? shots[0];
  }

  const shotKey = (cue: CombatCue) => cue.volley * 64 + cue.shot;

  function gunFired(cue: CombatCue): void {
    if (cue.beat.kind !== "volley") return;
    const volley = cue.beat.volleys[cue.volley];
    const shooter = shipFx(volley.shooterId);
    const target = shipFx(volley.targetId);
    if (!shooter || !target) return;
    const planned = volley.shots[cue.shot];
    const side = sideOf(shooter.held, target.held);
    const guns = gunsOnSide(shipGuns(shooter.shipClass), side);
    const gun = guns[gunForShot(cue.shot, volley.shots.length, guns.length)] ?? { x: (-side * shooter.size.beam) / 2, y: shooter.size.freeboard * 0.7, z: 0 };
    const muzzle = toWorld(shooter, muzzleOf(gun, side, 0.02), tmp);
    gunSmoke(shooter, muzzle, side);
    push(shooter, "recoil", side);
    sound(cueSound(cue), muzzle.x, muzzle.y, muzzle.z);

    const shot = freeShot();
    shot.active = true;
    shot.key = shotKey(cue);
    shot.from.copy(muzzle);
    const mark = aimPoint("low", target.size, sideOf(target.held, shooter.held), planned.hit, random);
    toWorld(target, mark, shot.to);
    if (!planned.hit) shot.to.y = env.seaHeight(shot.to.x, shot.to.z);
    shot.start = now();
    shot.seconds = Math.max(0.05, planned.landAt - planned.fireAt);
    shot.arc = 0.03 * shot.from.distanceTo(shot.to);
    shot.hit = planned.hit;
    shot.pos.copy(muzzle);
  }

  function shotLanded(cue: CombatCue): void {
    if (cue.beat.kind !== "volley") return;
    const volley = cue.beat.volleys[cue.volley];
    const key = shotKey(cue);
    const shot = shots.find((s) => s.active && s.key === key);
    if (!shot) return;
    shot.active = false;
    const at = shot.to;
    sound(cueSound(cue), at.x, at.y, at.z);
    if (!shot.hit) {
      splash(at, 1);
      return;
    }
    burst("splinter", at, reduced ? 6 : 10, 0.35, 0.4, 1, 30);
    // A smaller shower of sparks off the strike, back toward the shooter.
    tmp2.subVectors(shot.from, shot.to).setY(0).normalize();
    sparkBurst(at, tmp2.x, tmp2.z, reduced ? 3 : 7, 0.5);
    burst("mist", at, 2, 0.08, 0.02, 0.05);
    const target = shipFx(volley.targetId);
    const shooter = shipFx(volley.shooterId);
    if (target && shooter) push(target, "lurch", sideOf(target.held, shooter.held));
  }

  function mastFalls(cue: CombatCue): void {
    if (cue.beat.kind !== "volley") return;
    const target = shipFx(cue.beat.volleys[cue.volley].targetId);
    if (!target) return;
    // Splinters and a crack high in the rigging (the topmast's fall itself is drawn by the ship's model when it has one).
    const p = toWorld(target, { x: 0, y: target.size.freeboard + 0.45 * (target.size.masthead - target.size.freeboard), z: 0 }, tmp);
    burst("splinter", p, 14, 0.5, 0.4, 1.1, 30);
    sound(cueSound(cue), p.x, p.y, p.z);
  }

  function throwGrapples(thrower: ShipFx, target: ShipFx, cue: CombatCue): void {
    const side = sideOf(thrower.held, target.held);
    const targetSide = sideOf(target.held, thrower.held);
    director.grappling = { from: thrower.id, to: target.id };
    grapples.forEach((g, i) => {
      const u = (i / (grapples.length - 1) - 0.5) * 0.6;
      g.active = true;
      g.from = { x: (-side * thrower.size.beam) / 2, y: thrower.size.freeboard * 1.3, z: u * thrower.size.length };
      g.to = { x: ((-targetSide * target.size.beam) / 2) * 0.9, y: target.size.freeboard * 1.1, z: (u + (random() - 0.5) * 0.08) * target.size.length };
      g.throwAt = now() + i * 0.12 + random() * 0.1;
      g.flight = 0.55 + random() * 0.2;
    });
    // Then the crews haul the two together, square, without turning.
    const s = starboard(target.held.heading);
    const gap = Math.hypot(thrower.held.x - target.held.x, thrower.held.z - target.held.z) - (thrower.size.beam + target.size.beam) / 2;
    const close = Math.max(0, gap - HAULED_GAP);
    const towardTarget = -targetSide;
    thrower.haul = {
      start: now() + 1.1,
      seconds: reduced ? 0.8 : 1.6,
      x: thrower.held.x,
      z: thrower.held.z,
      dx: s[0] * towardTarget * close,
      dz: s[1] * towardTarget * close,
    };
    const p = toWorld(thrower, grapples[2].from, tmp);
    sound(cueSound(cue), p.x, p.y, p.z);
  }

  function beatStart(beat: CombatBeat): void {
    random = stream(subSeed(seed, SEED_FEATURES.combatEffects, beat.seedKey ?? beat.kind));
    switch (beat.kind) {
      case "declare": {
        const a = shipFx(beat.attackerId);
        const d = shipFx(beat.defenderId);
        if (!a || !d) return;
        engage(a, d, beat.seconds * 0.85);
        const runTo = forward(headingBefore(driftAlong()));
        // Room for either ship to run downwind, so a flight later stays in frame.
        frameCamera(
          [a.held, d.held, { x: d.held.x + runTo[0] * FLEE_RUN, z: d.held.z + runTo[1] * FLEE_RUN }, { x: a.held.x + runTo[0] * FLEE_RUN, z: a.held.z + runTo[1] * FLEE_RUN }],
          Math.max(a.size.length, d.size.length)
        );
        return;
      }
      case "volley":
        for (const v of beat.volleys) {
          shipFx(v.shooterId);
          shipFx(v.targetId);
        }
        return;
      case "flee": {
        const runner = shipFx(beat.fleeingId);
        const pursuer = shipFx(beat.pursuerId);
        if (!runner) return;
        const toward = driftAlong();
        const run = forward(headingBefore(toward));
        const start: [number, number] = [runner.held.x, runner.held.z];
        const end: [number, number] = [start[0] + run[0] * FLEE_RUN, start[1] + run[1] * FLEE_RUN];
        // Turn downwind and run: a curve out of its heading onto the run.
        const f = forward(runner.held.heading);
        const turnRoom = 0.25;
        setPath(runner, { segments: [[start, [start[0] + f[0] * turnRoom, start[1] + f[1] * turnRoom], [end[0] - run[0] * 0.35, end[1] - run[1] * 0.35], end]], ends: [1] }, beat.seconds * 0.8);
        if (pursuer) {
          // The pursuer swings to bring its broadside to bear on where the runner is going.
          turnTo(pursuer, sharedBeamHeading(pursuer.held, { x: end[0], z: end[1], heading: pursuer.held.heading }), beat.seconds * 0.6);
          frameCamera([pursuer.held, runner.held, { x: end[0], z: end[1] }], Math.max(runner.size.length, pursuer.size.length));
        }
        return;
      }
      case "closeAlongside": {
        const a = shipFx(beat.attackerId);
        const d = shipFx(beat.defenderId);
        if (!a || !d) return;
        const paths = closeInPath(a.held, d.held, { attackerBeam: a.size.beam, defenderBeam: d.size.beam, gap: CLOSE_IN_APPROACH_GAP });
        setPath(a, paths.attacker, beat.seconds * GRAPPLES_AT);
        setPath(d, paths.defender, beat.seconds * GRAPPLES_AT);
        frameCamera([a.held, d.held, pathPose(paths.defender, 1), pathPose(paths.attacker, 1)], Math.max(a.size.length, d.size.length));
        return;
      }
      case "sink": {
        const ship = shipFx(beat.shipId);
        if (!ship) return;
        const shooter = beat.shooterId ? shipFx(beat.shooterId) : null;
        ship.path = null;
        ship.turn = null;
        ship.sink = { start: now(), seconds: beat.seconds, side: shooter ? sideOf(ship.held, shooter.held) : 1, foamDue: now() };
        if (director.grappling && (director.grappling.from === ship.id || director.grappling.to === ship.id)) dropGrapples();
        return;
      }
    }
  }

  function dropGrapples(): void {
    for (const g of grapples) g.active = false;
    director.grappling = null;
  }

  function handle(cue: CombatCue): void {
    switch (cue.type) {
      case "beatStart":
        beatStart(cue.beat);
        return;
      case "gunFired":
        gunFired(cue);
        return;
      case "shotHit":
      case "shotSplashed":
        shotLanded(cue);
        return;
      case "mastFalls":
        mastFalls(cue);
        return;
      case "grapplesThrown":
        if (cue.beat.kind === "closeAlongside") {
          const a = shipFx(cue.beat.attackerId);
          const d = shipFx(cue.beat.defenderId);
          if (a && d) throwGrapples(a, d, cue);
        }
        return;
      case "fleeEnded":
        if (cue.beat.kind === "flee") banner(cue.beat.outcome === "escaped" ? "Escaped" : "Caught");
        return;
      case "hullGroans":
      case "shipBreaksUp":
      case "shipGone": {
        if (cue.beat.kind !== "sink") return;
        const ship = shipFx(cue.beat.shipId);
        if (!ship) return;
        const p = toWorld(ship, { x: 0, y: 0, z: 0 }, tmp);
        p.y = env.seaHeight(p.x, p.z);
        sound(cueSound(cue), p.x, p.y, p.z);
        if (cue.type === "shipBreaksUp") {
          burst("splinter", p, 16, 0.3, 0.3, 1.2, 10);
          burst("mist", p, 6, 0.15, 0.03, 0.08);
        }
        if (cue.type === "shipGone") ship.held.gone = true;
        return;
      }
    }
  }

  /** Soft foam round a ship going down: spawned along her waterline while she settles, none once she is gone. */
  function sinkFoam(fx: ShipFx, t: number): void {
    const sink = fx.sink!;
    if (fx.held.gone || now() < sink.foamDue) return;
    sink.foamDue = now() + (reduced ? 0.12 : 0.06);
    const spread = 0.6 + 0.6 * t;
    const along = (random() - 0.5) * fx.size.length * 0.9;
    // Along her waterline and out from it, where it shows past the hull and the sails.
    const across = (random() < 0.5 ? -1 : 1) * fx.size.beam * (0.5 + 0.9 * random()) * spread;
    const [sx, sz] = starboard(fx.held.heading);
    const [kx, kz] = forward(fx.held.heading);
    const x = fx.held.x + sx * across + kx * along;
    const z = fx.held.z + sz * across + kz * along;
    const out = 0.04 + 0.06 * random();
    spawn(pools.foam, KINDS.foam, {
      x, y: env.seaHeight(x, z), z,
      vx: sx * Math.sign(across) * out, vy: 0, vz: sz * Math.sign(across) * out,
      size: 0.05 + 0.06 * random(),
      life: (reduced ? 3 : 5) + 2 * random(),
      seed: random(),
    });
  }

  function updateShip(fx: ShipFx, dt: number): void {
    const t0 = now();
    const held = fx.held;
    let heel = 0;
    if (fx.turn) {
      const p = beatProgress(t0 - fx.turn.start, fx.turn.seconds);
      held.heading = turnHeading(fx.turn.from, fx.turn.to, easeInOutSine(p));
      if (p >= 1) fx.turn = null;
    }
    if (fx.path) {
      const p = easeInOutSine(beatProgress(t0 - fx.path.start, fx.path.seconds));
      const pose = pathPose(fx.path.path, p);
      held.x = pose.x;
      held.z = pose.z;
      held.heading = pose.heading;
      fx.path.heel += (pose.heel - fx.path.heel) * (1 - Math.exp(-dt * 3));
      heel += fx.path.heel;
      if (p >= 1) fx.path = null;
    }
    if (fx.haul && t0 >= fx.haul.start) {
      const p = easeInOutSine(beatProgress(t0 - fx.haul.start, fx.haul.seconds));
      held.x = fx.haul.x + fx.haul.dx * p;
      held.z = fx.haul.z + fx.haul.dz * p;
      if (p >= 1) fx.haul = null;
    }
    const rock = reduced ? 0.5 : 1;
    for (let i = 0; i < IMPULSES; i++) {
      heel += rock * recoilRoll(t0 - fx.recoilAt[i], fx.recoilSide[i] as 1 | -1);
      heel += rock * lurchRoll(t0 - fx.lurchAt[i], fx.lurchSide[i] as 1 | -1);
    }
    held.pitch = 0;
    held.drop = 0;
    if (fx.sink) {
      const t = beatProgress(t0 - fx.sink.start, fx.sink.seconds);
      const pose = sinkPose(t);
      held.drop = pose.drop * fx.size.masthead * SINK_PAST_MASTHEAD;
      held.pitch = pose.pitch;
      // She lists toward the side she was holed on, the shooter's: holed to starboard, she lies over to starboard (port lifts).
      heel += fx.sink.side * pose.heel;
      sinkFoam(fx, t);
    }
    held.heel = heel;
  }

  function update(dt: number, sea: SeaEnvironment): void {
    env = sea;
    const due = player.advance(dt);
    for (let i = 0; i < due.length; i++) handle(due[i]);
    const t = now();
    if (bannerUntil >= 0 && t >= bannerUntil) {
      bannerUntil = -1;
      onBanner?.(null);
    }
    for (const fx of ships.values()) updateShip(fx, dt);

    for (const shot of shots) {
      if (!shot.active) continue;
      // The landing cue retires it; until then it flies (and rests on its mark if a frame runs past).
      shotArc(shot.from, shot.to, Math.min(1, (t - shot.start) / shot.seconds), shot.arc, shot.pos);
    }
    for (const name in pools) stepPool(pools[name as PoolName], KINDS[name as PoolName], dt, env);

    // Let the ships go once the fight is over and the table has seen it all.
    if (player.busy() || fightOn) quietSince = t;
    else if (ships.size > 0 && t - quietSince >= RELEASE_DELAY) {
      for (const id of ships.keys()) poses.release(id);
      ships.clear();
      dropGrapples();
    }
  }

  return director;
}
