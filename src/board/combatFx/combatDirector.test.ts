import { describe, expect, it } from "vitest";
import { createCombatDirector, type CombatDirector } from "./combatDirector";
import { createCombatShipPoses, type CombatShipPoses } from "./combatShipPoses";
import { aliveCount } from "./particlePool";
import type { CombatBeat } from "./combatTimeline";
import { forward } from "./shipPaths";
import type { ShipClass } from "../../game/types";
import type { SoundId } from "../../audio/soundRegistry";

const CLASSES: Record<string, ShipClass> = { "0": "Frigate", "1": "Sloop", "npc-1": "Flute" };
const flatSea = { windX: 0.05, windZ: 0.02, seaHeight: () => 0 };

function setup(reducedMotion = false) {
  const poses: CombatShipPoses = createCombatShipPoses();
  // Ship 0 at the origin, ship 1 one hex east; both sailing north.
  poses.report("0", { x: 0, z: 0, heading: 0, copyX: 0, anchor: null });
  poses.report("1", { x: Math.sqrt(3), z: 0, heading: 0, copyX: 0, anchor: null });
  poses.report("npc-1", { x: Math.sqrt(3), z: 0, heading: 0, copyX: 0, anchor: null });
  const sounds: { id: SoundId; at: readonly number[] }[] = [];
  const director = createCombatDirector({ poses, seed: 7, playSound: (id, at) => sounds.push({ id, at: [...at] }) });
  director.setReducedMotion(reducedMotion);
  director.setFightOn(true);
  return { poses, sounds, director };
}

const play = (director: CombatDirector, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) director.update(1 / 60, flatSea);
};

const declare: CombatBeat = { kind: "declare", attackerId: "0", defenderId: "1", seconds: 2 };
const volley: CombatBeat = {
  kind: "volley",
  seconds: 3,
  volleys: [
    {
      shooterId: "0",
      targetId: "1",
      mastFalls: false,
      shots: [
        { fireAt: 0, landAt: 0.4, hit: true },
        { fireAt: 0.25, landAt: 0.6, hit: false },
      ],
    },
  ],
};

describe("the combat director: beats played on the board (#263)", () => {
  it("at the declaration both ships turn beam-on to each other, and the camera frames them", () => {
    const { director, poses } = setup();
    director.enqueue([declare], CLASSES);
    play(director, 2.2);
    const a = poses.held("0")!;
    const b = poses.held("1")!;
    // Beam-on: the line between them square to both keels.
    for (const ship of [a, b]) {
      const [fx, fz] = forward(ship.heading);
      expect(Math.abs(fx * (b.x - a.x) + fz * (b.z - a.z))).toBeLessThan(1e-6);
    }
    const view = director.takeCameraRequest();
    expect(view).not.toBeNull();
    // Looking between the two (with room for a run downwind), from far enough back to see both.
    expect(view!.target[0]).toBeGreaterThan(0);
    expect(view!.target[0]).toBeLessThan(Math.sqrt(3) + 0.7);
    expect(view!.distance).toBeGreaterThan(Math.sqrt(3));
    expect(director.takeCameraRequest()).toBeNull(); // taken once
  });

  it("asks for the framing under reduced motion too: the board cuts to it, never flies (cameraFlight.ts)", () => {
    const { director } = setup(true);
    director.enqueue([declare], CLASSES);
    play(director, 1);
    expect(director.takeCameraRequest()).not.toBeNull();
  });

  it("a volley: each gun flashes, smokes and is heard where it fires; the hit splinters, the miss splashes", () => {
    const { director, sounds } = setup();
    director.enqueue([declare, volley], CLASSES);
    play(director, 2.05);
    expect(aliveCount(director.pools.flash)).toBe(1);
    expect(aliveCount(director.pools.smoke)).toBeGreaterThan(3);
    expect(sounds.filter((s) => s.id.startsWith("cannon-"))).toHaveLength(1);
    // The first gun is heard at ship 0's side, not at ship 1.
    expect(Math.abs(sounds[0].at[0])).toBeLessThan(0.5);
    play(director, 0.5);
    expect(sounds.filter((s) => s.id.startsWith("cannon-"))).toHaveLength(2);
    expect(aliveCount(director.pools.splinter)).toBeGreaterThan(0);
    play(director, 0.2);
    expect(aliveCount(director.pools.spray)).toBeGreaterThan(0);
  });

  it("each gun throws hot sparks out of the muzzle that arc down and die within a second; a hit throws a few more", () => {
    const { director } = setup();
    director.enqueue([declare, volley], CLASSES);
    play(director, 2.05);
    const atGun = aliveCount(director.pools.spark);
    expect(atGun).toBeGreaterThan(5);
    play(director, 0.4); // the hit has landed (and the second gun fired)
    expect(aliveCount(director.pools.spark)).toBeGreaterThan(atGun);
    play(director, 2);
    expect(aliveCount(director.pools.spark)).toBe(0);
  });

  it("embers drift up out of the smoke for a moment", () => {
    const { director } = setup();
    director.enqueue([declare, volley], CLASSES);
    play(director, 2.1);
    expect(aliveCount(director.pools.ember)).toBeGreaterThan(0);
    play(director, 5);
    expect(aliveCount(director.pools.ember)).toBe(0);
  });

  it("fewer sparks under reduced motion", () => {
    const full = setup();
    const calm = setup(true);
    for (const { director } of [full, calm]) {
      director.enqueue([declare, volley], CLASSES);
      play(director, 2.05);
    }
    expect(aliveCount(calm.director.pools.spark)).toBeLessThan(aliveCount(full.director.pools.spark));
  });

  it("a beat's sparks are seeded by the beat, not by what the page played before: every seat sees the same", () => {
    const keyed: CombatBeat = { ...volley, seedKey: "0:1:1:volley" };
    const a = setup();
    const b = setup();
    // One seat watched an earlier fight; the other loaded just now. (Directions differ with the ships' headings; the draws do not.)
    a.director.enqueue([{ ...declare, seedKey: "earlier" }, { ...volley, seedKey: "earlier-volley" }], CLASSES);
    play(a.director, 8);
    for (const { director } of [a, b]) director.enqueue([keyed], CLASSES);
    const sparks = (d: CombatDirector) => {
      const p = d.pools.spark;
      return Array.from(p.state).flatMap((alive, i) => (alive ? [Math.round(p.vy[i] * 1e5), Math.round(p.size[i] * 1e5), Math.round(p.life[i] * 1e5)] : [])).sort();
    };
    const fresh = (d: CombatDirector) => {
      d.pools.spark.state.fill(0);
      d.update(1 / 120, flatSea);
      return sparks(d);
    };
    expect(fresh(a.director)).toEqual(fresh(b.director));
  });

  it("the guns heel the shooter away from them and the hit makes the target lurch, both steadying after", () => {
    const { director, poses } = setup();
    director.enqueue([declare, volley], CLASSES);
    play(director, 2.6);
    expect(Math.abs(poses.held("0")!.heel)).toBeGreaterThan(0.005);
    expect(Math.abs(poses.held("1")!.heel)).toBeGreaterThan(0.005);
    play(director, 8);
    expect(Math.abs(poses.held("0")!.heel)).toBeLessThan(0.002);
    expect(Math.abs(poses.held("1")!.heel)).toBeLessThan(0.002);
  });

  it("the smoke lingers into the next round, then thins out", () => {
    const { director } = setup();
    director.enqueue([declare, volley], CLASSES);
    play(director, 10);
    expect(aliveCount(director.pools.smoke)).toBeGreaterThan(0);
    play(director, 30);
    expect(aliveCount(director.pools.smoke)).toBe(0);
  });

  it("a fleeing ship turns downwind and runs", () => {
    const { director, poses } = setup();
    director.enqueue([declare, { kind: "flee", fleeingId: "1", pursuerId: "0", outcome: "escaped", seconds: 4 }], CLASSES);
    play(director, 6.5);
    const runner = poses.held("1")!;
    const [fx, fz] = forward(runner.heading);
    const wind = Math.hypot(flatSea.windX, flatSea.windZ);
    expect((fx * flatSea.windX + fz * flatSea.windZ) / wind).toBeGreaterThan(0.99);
    expect((runner.x - Math.sqrt(3)) * flatSea.windX + runner.z * flatSea.windZ).toBeGreaterThan(0);
  });

  it("boarding: the ships close alongside, the grapples fly and haul them together", () => {
    const { director, poses } = setup();
    director.enqueue([declare, { kind: "closeAlongside", attackerId: "0", defenderId: "npc-1", seconds: 5 }], CLASSES);
    play(director, 2 + 5 * 0.6);
    expect(director.grapples.some((g) => g.active)).toBe(true);
    play(director, 3);
    const a = poses.held("0")!;
    const d = poses.held("npc-1")!;
    expect(Math.hypot(a.x - d.x, a.z - d.z)).toBeLessThan(0.4);
  });

  it("a sinking ship settles, lists, goes under, and its foam clears once she is gone", () => {
    const { director, poses } = setup();
    director.enqueue([{ kind: "sink", shipId: "1", shooterId: "0", seconds: 4 }], CLASSES);
    play(director, 2);
    const sinking = poses.held("1")!;
    expect(sinking.drop).toBeGreaterThan(0);
    expect(Math.abs(sinking.heel)).toBeGreaterThan(0.05);
    expect(aliveCount(director.pools.foam)).toBeGreaterThan(0);
    play(director, 2.2);
    expect(poses.held("1")!.gone).toBe(true);
    play(director, 20);
    expect(aliveCount(director.pools.foam)).toBe(0);
  });

  it("lets the ships go once the fight is over and the beats have played", () => {
    const { director, poses } = setup();
    director.enqueue([declare], CLASSES);
    play(director, 3);
    expect(poses.held("0")).toBeDefined();
    expect(director.holding()).toBe(true);
    director.setFightOn(false);
    play(director, 3);
    expect(poses.held("0")).toBeUndefined();
    expect(director.holding()).toBe(false);
  });
});
