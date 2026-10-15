/**
 * PROTOTYPE (combat animation lab, PRD #259): plays the beats. It holds the
 * two ships' animated state, the effect pools, the shots in flight and the
 * grapples, and advances them once a frame. No React here: the scene's
 * components read what it holds and draw it. The curves and timings are the
 * pure modules beside it (shipPaths, broadside, beatTiming, particlePool).
 */
import { Matrix4, Vector3, type Object3D } from "three";
import type { ShipClass } from "../../game/types";
import { type HullBox, shipHullBox } from "../../board/shipHull";
import { shipModel, shipModelScale } from "../../board/shipModels";
import { BEATS, MAST_LANDS_AT, beatProgress, easeInOutSine, mastTopple, sinkPose, type BeatId } from "./beatTiming";
import {
  aimPoint,
  gunsOnSide,
  muzzleOf,
  recoilRoll,
  rippleTimes,
  RIPPLE_SECONDS,
  shotArc,
  shotSeconds,
  type Aim,
  type TargetSize,
  type Vec3,
} from "./broadside";
import { aliveCount, createPool, spawn, stepPool, type ParticleKind, type ParticlePool, type SeaEnvironment } from "./particlePool";
import { mulberry32 } from "./rng";
import { bearAwayPath, closeInPath, forward, pathPose, rakePath, sideOf, starboard, type Point, type ShipPath, type ShipPose } from "./shipPaths";

export type ShipKey = "a" | "b";

export interface ShipRuntime {
  readonly key: ShipKey;
  readonly shipClass: ShipClass;
  readonly hull: HullBox;
  readonly size: TargetSize;
  pose: ShipPose;
  /** Roll (positive lifts port), bow-up pitch, and how far down it has sunk (share of its sink depth). */
  heel: number;
  pitch: number;
  drop: number;
  /** World units/s along its course, for its hull foam. */
  speed: number;
  path: { path: ShipPath; start: number; seconds: number; heel: number } | null;
  recoil: { at: number; side: 1 | -1 } | null;
  /** The broken mainmast: the side it falls to (1 port, -1 starboard) and its angle off upright. */
  mast: { start: number; side: 1 | -1; angle: number; landed: boolean } | null;
  sink: { start: number } | null;
  sunk: boolean;
  /** The ship's own frame, under its wave pose: set by the ship's component. */
  anchor: Object3D | null;
  /** Its guns (the model's), ship-local; set when the model loads. */
  guns: Vec3[];
  /** Its mainmast's break, ship-local: height and station of the break and the topmast's length above it. */
  mastBreak: { y: number; z: number; length: number } | null;
}

export interface Shot {
  active: boolean;
  from: Vector3;
  to: Vector3;
  start: number;
  seconds: number;
  arc: number;
  aim: Aim;
  hit: boolean;
  cargo: boolean;
  pos: Vector3;
}

export interface Grapple {
  active: boolean;
  /** Ship-local points on the actor's rail and the target's. */
  from: Vec3;
  to: Vec3;
  throwAt: number;
  flight: number;
}

interface ActiveBeat {
  id: BeatId;
  start: number;
  seconds: number;
  /** Progress last frame, for triggers on the way. */
  prev: number;
  data: { fireAt?: number };
}

export const KINDS = {
  smoke: { gravity: -0.012, drag: 1.6, windFollow: 1, onSea: "pass", life: 20 },
  flash: { gravity: 0, drag: 6, windFollow: 0, onSea: "pass", life: 0.14 },
  spray: { gravity: 2.6, drag: 0.35, windFollow: 0.2, onSea: "die", life: 2.5 },
  mist: { gravity: -0.01, drag: 2.5, windFollow: 0.6, onSea: "pass", life: 2.4 },
  dust: { gravity: 0.02, drag: 2.5, windFollow: 0.8, onSea: "pass", life: 2.5 },
  splinter: { gravity: 2.6, drag: 0.3, windFollow: 0.1, onSea: "float", life: 16 },
  crate: { gravity: 2.6, drag: 0.6, windFollow: 0.35, onSea: "float", life: 60 },
} as const satisfies Record<string, ParticleKind>;
export type PoolName = keyof typeof KINDS;

const CAPACITY: Record<PoolName, number> = { smoke: 640, flash: 48, spray: 640, mist: 160, dust: 96, splinter: 320, crate: 48 };
const SHOT_CAPACITY = 48;
const GRAPPLE_COUNT = 5;
/** Pause between beats played from the URL's sequence, s. */
const QUEUE_GAP = 0.9;

export interface Director {
  ships: Record<ShipKey, ShipRuntime>;
  actor: ShipKey;
  pools: Record<PoolName, ParticlePool>;
  shots: Shot[];
  grapples: Grapple[];
  time: number;
  /** The camera move asked for, if any: the rig frames both ships over `seconds`. */
  cameraMove: { start: number; seconds: number } | null;
  play: (id: BeatId) => void;
  /** The ship's drawn frame (under its wave pose), from its component. */
  attach: (key: ShipKey, anchor: Object3D) => void;
  /** The ship's guns and mainmast break, once its model has loaded. */
  fit: (key: ShipKey, guns: Vec3[], mastBreak: ShipRuntime["mastBreak"]) => void;
  finishCameraMove: () => void;
  enqueue: (ids: readonly BeatId[]) => void;
  reset: () => void;
  update: (dt: number, env: SeaEnvironment) => void;
  status: () => string;
}

export interface DirectorSetup {
  a: { shipClass: ShipClass; pose: ShipPose };
  b: { shipClass: ShipClass; pose: ShipPose };
  actor: ShipKey;
  /** Unit world XZ the wind blows toward (the scene's wind). */
  windToward: Point;
}

export function sizeOf(shipClass: ShipClass): TargetSize {
  const model = shipModel(shipClass);
  const hull = shipHullBox(shipClass);
  if (!model) return { length: hull[2], beam: hull[0], freeboard: hull[1] * 0.5, masthead: hull[1] * 3 };
  const s = shipModelScale();
  return {
    length: model.lengthMetres * s,
    beam: model.beamMetres * s,
    freeboard: (model.depthMetres - model.draftMetres) * s,
    masthead: model.mastheadMetres * s,
  };
}

function newShip(key: ShipKey, shipClass: ShipClass, pose: ShipPose, keep?: ShipRuntime): ShipRuntime {
  return {
    key,
    shipClass,
    hull: shipHullBox(shipClass),
    size: sizeOf(shipClass),
    pose: { ...pose },
    heel: 0,
    pitch: 0,
    drop: 0,
    speed: 0,
    path: null,
    recoil: null,
    mast: null,
    sink: null,
    sunk: false,
    anchor: keep?.anchor ?? null,
    guns: keep?.guns ?? [],
    mastBreak: keep?.mastBreak ?? null,
  };
}

export function createDirector(setup: DirectorSetup): Director {
  const pools = Object.fromEntries(
    (Object.keys(KINDS) as PoolName[]).map((name) => [name, createPool(CAPACITY[name])])
  ) as Record<PoolName, ParticlePool>;
  const shots: Shot[] = Array.from({ length: SHOT_CAPACITY }, () => ({
    active: false,
    from: new Vector3(),
    to: new Vector3(),
    start: 0,
    seconds: 1,
    arc: 0,
    aim: "low" as Aim,
    hit: false,
    cargo: false,
    pos: new Vector3(),
  }));
  const grapples: Grapple[] = Array.from({ length: GRAPPLE_COUNT }, () => ({
    active: false,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    throwAt: 0,
    flight: 0.7,
  }));
  const random = mulberry32(259);
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const local: Vec3 = { x: 0, y: 0, z: 0 };
  const placement = new Matrix4();
  let env: SeaEnvironment = { windX: 0, windZ: 0, seaHeight: () => 0 };
  const scheduled: { at: number; run: () => void }[] = [];
  let active: ActiveBeat[] = [];
  let queue: BeatId[] = [];
  let queueReadyAt = 0;

  const director: Director = {
    ships: { a: newShip("a", setup.a.shipClass, setup.a.pose), b: newShip("b", setup.b.shipClass, setup.b.pose) },
    actor: setup.actor,
    pools,
    shots,
    grapples,
    time: 0,
    cameraMove: null,
    play: (id) => startBeat(id),
    attach: (key, anchor) => {
      director.ships[key].anchor = anchor;
    },
    fit: (key, guns, mastBreak) => {
      director.ships[key].guns = guns;
      director.ships[key].mastBreak = mastBreak;
    },
    finishCameraMove: () => {
      director.cameraMove = null;
    },
    enqueue: (ids) => {
      queue = [...queue, ...ids];
      queueReadyAt = director.time + 1.5;
    },
    reset,
    update,
    status,
  };

  const actorShip = () => director.ships[director.actor];
  const targetShip = () => director.ships[director.actor === "a" ? "b" : "a"];

  /** A ship-local point in world space, through the ship's drawn frame (or its pose, before it is drawn). */
  function toWorld(ship: ShipRuntime, p: Vec3, out: Vector3): Vector3 {
    if (ship.anchor) return out.set(p.x, p.y, p.z).applyMatrix4(ship.anchor.matrixWorld);
    placement.makeRotationY(ship.pose.heading).setPosition(ship.pose.x, 0, ship.pose.z);
    return out.set(p.x, p.y, p.z).applyMatrix4(placement);
  }

  function reset(): void {
    director.ships = {
      a: newShip("a", setup.a.shipClass, setup.a.pose, director.ships.a),
      b: newShip("b", setup.b.shipClass, setup.b.pose, director.ships.b),
    };
    for (const pool of Object.values(pools)) pool.state.fill(0);
    for (const s of shots) s.active = false;
    for (const g of grapples) g.active = false;
    active = [];
    scheduled.length = 0;
    queue = [];
  }

  function startBeat(id: BeatId): void {
    const actor = actorShip();
    const target = targetShip();
    const beat: ActiveBeat = { id, start: director.time, seconds: BEATS[id].seconds, prev: 0, data: {} };
    if (actor.sunk || (target.sunk && id !== "declare")) return;
    switch (id) {
      case "declare":
        director.cameraMove = { start: director.time, seconds: BEATS.declare.seconds };
        break;
      case "broadsideHigh":
      case "broadsideLow":
        fireBroadside(actor, target, id === "broadsideHigh" ? "high" : "low");
        break;
      case "rake": {
        dropGrapples();
        const rake = rakePath(actor.pose, target.pose, { attackerLength: actor.size.length, defenderLength: target.size.length });
        setPath(actor, rake.attacker, beat.seconds);
        setPath(target, rake.defender, beat.seconds);
        beat.data.fireAt = rake.fireAt;
        break;
      }
      case "closeIn": {
        dropGrapples();
        const close = closeInPath(actor.pose, target.pose, { attackerBeam: actor.size.beam, defenderBeam: target.size.beam, gap: 0.035 });
        setPath(actor, close.attacker, beat.seconds);
        setPath(target, close.defender, beat.seconds);
        break;
      }
      case "bearAway":
        dropGrapples();
        setPath(actor, bearAwayPath(actor.pose, setup.windToward), beat.seconds);
        break;
      case "mastFalls":
        if (target.mast) return;
        target.mast = { start: director.time, side: sideOf(target.pose, actor.pose), angle: 0, landed: false };
        breakBurst(target);
        break;
      case "cargoSpills":
        fireOne(actor, target);
        break;
      case "sink":
        if (target.sink) return;
        dropGrapples();
        target.sink = { start: director.time };
        break;
    }
    active.push(beat);
  }

  function setPath(ship: ShipRuntime, path: ShipPath, seconds: number): void {
    ship.path = { path, start: director.time, seconds, heel: 0 };
  }

  function dropGrapples(): void {
    for (const g of grapples) g.active = false;
  }

  function freeShot(): Shot {
    return shots.find((s) => !s.active) ?? shots[0];
  }

  function launch(from: Vector3, to: Vector3, aim: Aim, hit: boolean, cargo: boolean, delay: number): void {
    scheduled.push({
      at: director.time + delay,
      run: () => {
        const shot = freeShot();
        shot.active = true;
        shot.from.copy(from);
        shot.to.copy(to);
        shot.start = director.time;
        const distance = from.distanceTo(to);
        shot.seconds = shotSeconds(distance);
        shot.arc = 0.03 * distance;
        shot.aim = aim;
        shot.hit = hit;
        shot.cargo = cargo;
        shot.pos.copy(from);
      },
    });
  }

  /** The guns that bear, or a row of stand-ins while the model loads. */
  function bearingGuns(ship: ShipRuntime, side: 1 | -1): Vec3[] {
    const guns = gunsOnSide(ship.guns, side);
    if (guns.length > 0) return guns;
    return [-0.3, -0.15, 0, 0.15, 0.3].map((u) => ({ x: (-side * ship.size.beam) / 2, y: ship.size.freeboard * 0.7, z: u * ship.size.length }));
  }

  function fireBroadside(shooter: ShipRuntime, target: ShipRuntime, aim: Aim): void {
    const side = sideOf(shooter.pose, target.pose);
    const guns = bearingGuns(shooter, side);
    const times = rippleTimes(guns.length, RIPPLE_SECONDS);
    shooter.recoil = { at: director.time + times[Math.floor(times.length / 2)], side };
    const shooterSideOfTarget = sideOf(target.pose, shooter.pose);
    guns.forEach((gun, i) => {
      scheduled.push({
        at: director.time + times[i],
        run: () => {
          const muzzle = toWorld(shooter, muzzleOf(gun, side, 0.025), new Vector3());
          gunFire(shooter, muzzle, side);
          const mark = aimPoint(aim, target.size, shooterSideOfTarget, random);
          const to = toWorld(target, mark, new Vector3());
          if (!mark.hit) to.y = env.seaHeight(to.x, to.z);
          launch(muzzle, to, aim, mark.hit, false, 0);
        },
      });
    });
  }

  function fireOne(shooter: ShipRuntime, target: ShipRuntime): void {
    const side = sideOf(shooter.pose, target.pose);
    const guns = bearingGuns(shooter, side);
    const gun = guns[Math.floor(guns.length / 2)];
    const muzzle = toWorld(shooter, muzzleOf(gun, side, 0.025), new Vector3());
    gunFire(shooter, muzzle, side);
    shooter.recoil = { at: director.time, side };
    const near = -sideOf(target.pose, shooter.pose) * (target.size.beam / 2);
    const to = toWorld(target, { x: near, y: target.size.freeboard * 0.45, z: 0.05 * target.size.length }, new Vector3());
    launch(muzzle, to, "low", true, true, 0);
  }

  /** Flash and smoke at a muzzle, blown out along the side. */
  function gunFire(ship: ShipRuntime, muzzle: Vector3, side: 1 | -1): void {
    const [sx, sz] = starboard(ship.pose.heading);
    const ox = side * sx, oz = side * sz;
    spawn(pools.flash, KINDS.flash, { x: muzzle.x + ox * 0.015, y: muzzle.y, z: muzzle.z + oz * 0.015, vx: ox * 0.3, vy: 0, vz: oz * 0.3, size: 0.07 + 0.03 * random(), seed: random() });
    for (let k = 0; k < 6; k++) {
      const v = 0.35 + 0.9 * random();
      spawn(pools.smoke, KINDS.smoke, {
        x: muzzle.x, y: muzzle.y, z: muzzle.z,
        vx: ox * v + (random() - 0.5) * 0.12,
        vy: 0.03 + 0.08 * random(),
        vz: oz * v + (random() - 0.5) * 0.12,
        size: 0.035 + 0.03 * random(),
        life: 16 + 6 * random(),
        seed: random(),
      });
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
    tmp2.set(at.x, sea, at.z);
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
    burst("mist", tmp2, Math.round(3 * scale), 0.12 * scale, 0.05, 0.05 * scale);
  }

  function impact(shot: Shot): void {
    const at = shot.to;
    if (!shot.hit) {
      splash(at, 1);
      return;
    }
    if (shot.aim === "high") {
      burst("splinter", at, 10, 0.6, 0.5, 1, 30);
      burst("dust", at, 3, 0.1, 0.02, 0.05);
      return;
    }
    burst("splinter", at, shot.aim === "rake" ? 14 : 8, 0.5, 0.45, 1, 30);
    burst("dust", at, 2, 0.08, 0.02, 0.05);
    if (shot.aim === "low") splash(at, 0.45);
    if (shot.cargo) spillCargo(targetShip(), at);
  }

  function spillCargo(target: ShipRuntime, at: Vector3): void {
    const actor = actorShip();
    // Out of the breach, toward the shooter's side.
    const side = sideOf(target.pose, actor.pose);
    const [sx, sz] = starboard(target.pose.heading);
    const [fx, fz] = forward(target.pose.heading);
    for (let k = 0; k < 8; k++) {
      const out = 0.2 + 0.35 * random();
      const along = (random() - 0.5) * 0.25;
      spawn(pools.crate, KINDS.crate, {
        x: at.x + side * sx * 0.02, y: at.y + 0.02, z: at.z + side * sz * 0.02,
        vx: side * sx * out + fx * along, vy: 0.35 + 0.45 * random(), vz: side * sz * out + fz * along,
        size: 0.022 + 0.014 * random(),
        spin: (random() - 0.5) * 10,
        seed: random(),
      });
    }
  }

  /** Splinters and dust where the mainmast is shot through. */
  function breakBurst(ship: ShipRuntime): void {
    const b = ship.mastBreak;
    if (!b) return;
    local.x = 0; local.y = b.y; local.z = b.z;
    toWorld(ship, local, tmp);
    burst("splinter", tmp, 14, 0.5, 0.4, 1.1, 30);
    burst("dust", tmp, 4, 0.08, 0.02, 0.06);
  }

  /** Spray along the fallen topmast where it strikes the sea. */
  function mastSplash(ship: ShipRuntime): void {
    const b = ship.mastBreak;
    if (!b || !ship.mast) return;
    for (let k = 0; k < 5; k++) {
      const u = 0.35 + 0.65 * (k / 4);
      // The topmast lies in the sea over the side, out from the hull: port is +x in the ship's frame.
      local.x = ship.mast.side * (ship.size.beam / 2 + b.length * u);
      local.y = 0;
      local.z = b.z;
      toWorld(ship, local, tmp);
      splash(tmp, 0.7);
    }
  }

  function sinkFroth(ship: ShipRuntime, t: number): void {
    const { length, beam } = ship.size;
    const n = t > 0.5 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      local.x = (random() < 0.5 ? -1 : 1) * beam * 0.5;
      local.y = 0;
      local.z = (random() - 0.5) * length * 0.9;
      toWorld(ship, local, tmp);
      tmp.y = env.seaHeight(tmp.x, tmp.z);
      burst("mist", tmp, 1, 0.05, 0.02, 0.06);
      spawn(pools.spray, KINDS.spray, { x: tmp.x, y: tmp.y, z: tmp.z, vx: 0, vy: 0.25 + 0.3 * random(), vz: 0, size: 0.012, seed: random() });
    }
  }

  function sinkWreckage(ship: ShipRuntime): void {
    local.x = 0; local.y = 0; local.z = 0;
    toWorld(ship, local, tmp);
    tmp.y = env.seaHeight(tmp.x, tmp.z);
    burst("mist", tmp, 8, 0.2, 0.03, 0.09);
    burst("crate", tmp, 5, 0.2, 0.3, 0.03, 4);
    burst("splinter", tmp, 12, 0.3, 0.3, 1.2, 10);
  }

  function crossed(beat: ActiveBeat, p: number, at: number): boolean {
    return beat.prev < at && p >= at;
  }

  function update(dt: number, sea: SeaEnvironment): void {
    env = sea;
    director.time += dt;
    const now = director.time;
    // Beats from the URL's sequence, one after another.
    if (queue.length > 0 && active.length === 0 && now >= queueReadyAt) {
      const next = queue.shift()!;
      startBeat(next);
      queueReadyAt = now + BEATS[next].seconds + QUEUE_GAP;
    }
    for (let i = scheduled.length - 1; i >= 0; i--) {
      if (scheduled[i].at <= now) {
        const job = scheduled[i];
        scheduled.splice(i, 1);
        job.run();
      }
    }
    for (const beat of active) {
      const p = beatProgress(now - beat.start, beat.seconds);
      if (beat.id === "rake" && beat.data.fireAt !== undefined && crossed(beat, easeInOutSine(p), beat.data.fireAt)) {
        fireBroadside(actorShip(), targetShip(), "rake");
      }
      if (beat.id === "closeIn" && crossed(beat, p, 0.55)) throwGrapples();
      beat.prev = beat.id === "rake" ? easeInOutSine(p) : p;
    }
    active = active.filter((b) => now - b.start < b.seconds);

    for (const ship of Object.values(director.ships)) updateShip(ship, dt, now);

    for (const shot of shots) {
      if (!shot.active) continue;
      const s = (now - shot.start) / shot.seconds;
      if (s >= 1) {
        shot.active = false;
        impact(shot);
        continue;
      }
      shotArc(shot.from, shot.to, s, shot.arc, shot.pos);
    }
    for (const name of Object.keys(pools) as PoolName[]) stepPool(pools[name], KINDS[name], dt, env);
  }

  function updateShip(ship: ShipRuntime, dt: number, now: number): void {
    if (ship.sunk) return;
    let heel = 0;
    if (ship.path) {
      const { path, start, seconds } = ship.path;
      const s = easeInOutSine(beatProgress(now - start, seconds));
      const pose = pathPose(path, s);
      ship.speed = Math.hypot(pose.x - ship.pose.x, pose.z - ship.pose.z) / Math.max(dt, 1e-4);
      ship.pose = { x: pose.x, z: pose.z, heading: pose.heading };
      ship.path.heel += (pose.heel - ship.path.heel) * (1 - Math.exp(-dt * 3));
      heel = ship.path.heel;
      if (s >= 1) ship.path = null;
    } else ship.speed *= Math.exp(-dt * 2);
    if (ship.recoil) heel += recoilRoll(now - ship.recoil.at, ship.recoil.side);
    if (ship.mast) {
      const t = beatProgress(now - ship.mast.start, BEATS.mastFalls.seconds);
      ship.mast.angle = mastTopple(t);
      if (!ship.mast.landed && t >= MAST_LANDS_AT) {
        ship.mast.landed = true;
        mastSplash(ship);
      }
      if (ship.mast.landed) heel += recoilRoll(now - ship.mast.start - MAST_LANDS_AT * BEATS.mastFalls.seconds, ship.mast.side) * 1.2;
    }
    ship.pitch = 0;
    ship.drop = 0;
    if (ship.sink) {
      const t = beatProgress(now - ship.sink.start, BEATS.sink.seconds);
      const pose = sinkPose(t);
      ship.drop = pose.drop;
      ship.pitch = pose.pitch;
      // She lists toward the side she was holed on: the shooter's.
      heel += sideOf(ship.pose, director.ships[ship.key === "a" ? "b" : "a"].pose) * pose.heel;
      if (t < 1) sinkFroth(ship, t);
      else {
        ship.sunk = true;
        sinkWreckage(ship);
      }
    }
    ship.heel = heel;
  }

  function throwGrapples(): void {
    const actor = actorShip();
    const target = targetShip();
    const side = sideOf(actor.pose, target.pose);
    const targetSide = sideOf(target.pose, actor.pose);
    grapples.forEach((g, i) => {
      const u = (i / (grapples.length - 1) - 0.5) * 0.6;
      g.active = true;
      g.from = { x: (-side * actor.size.beam) / 2, y: actor.size.freeboard * 1.25, z: u * actor.size.length };
      g.to = { x: (-targetSide * target.size.beam) / 2 * 0.9, y: target.size.freeboard * 1.05, z: (u + (random() - 0.5) * 0.08) * target.size.length };
      g.throwAt = director.time + i * 0.12 + random() * 0.1;
      g.flight = 0.55 + random() * 0.2;
    });
  }

  function status(): string {
    const beats = active.map((b) => `${BEATS[b.id].label} ${Math.round(beatProgress(director.time - b.start, b.seconds) * 100)}%`).join(", ") || "idle";
    const counts = (Object.keys(pools) as PoolName[]).map((n) => `${n} ${aliveCount(pools[n])}`).join(" · ");
    const queued = queue.length > 0 ? ` · queued: ${queue.join(", ")}` : "";
    return `${beats}${queued}\n${counts} · shots ${shots.filter((s) => s.active).length}`;
  }

  return director;
}

/** Model metres to ship-local units (the model's placement in Ship.tsx: turned half round, scaled). */
export function toShipLocalScale(x: number, y: number, z: number): Vec3 {
  const s = shipModelScale();
  return { x: -x * s, y: y * s, z: -z * s };
}
