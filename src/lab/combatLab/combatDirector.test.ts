import { describe, expect, it } from "vitest";
import { createDirector, type Director } from "./combatDirector";
import { aliveCount } from "./particlePool";
import type { BeatId } from "./beatTiming";

const sea = { windX: 0.05, windZ: 0, seaHeight: () => 0 };
const setup = () =>
  createDirector({
    a: { shipClass: "Frigate", pose: { x: 0, z: 0, heading: 0 } },
    b: { shipClass: "Galleon", pose: { x: Math.sqrt(3), z: 0, heading: 0 } },
    actor: "a",
    windToward: [1, 0],
  });
const run = (d: Director, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) d.update(1 / 60, sea);
};
const play = (id: BeatId, seconds = 4) => {
  const d = setup();
  d.play(id);
  run(d, seconds);
  return d;
};

describe("combat director (smoke tests of the lab's beats)", () => {
  it("a broadside leaves smoke hanging downwind of the guns", () => {
    const d = play("broadsideHigh");
    expect(aliveCount(d.pools.smoke)).toBeGreaterThan(10);
    expect(aliveCount(d.pools.flash)).toBe(0); // the flashes are long gone
  });

  it("a low broadside throws up spray or splinters at the target", () => {
    const d = play("broadsideLow", 0.9);
    expect(aliveCount(d.pools.spray) + aliveCount(d.pools.splinter)).toBeGreaterThan(0);
  });

  it("the rake carries the attacker across the target's stern and fires", () => {
    const d = play("rake", 7);
    expect(d.ships.a.pose.x).toBeGreaterThan(Math.sqrt(3)); // came out on the far side of the target (which lies at +x)
    expect(aliveCount(d.pools.smoke)).toBeGreaterThan(0);
  });

  it("closing in lays the ships alongside and throws the grapples", () => {
    const d = play("closeIn", 7);
    const gap = Math.hypot(d.ships.a.pose.x - d.ships.b.pose.x, d.ships.a.pose.z - d.ships.b.pose.z);
    expect(gap).toBeLessThan(0.6);
    expect(d.grapples.every((g) => g.active)).toBe(true);
  });

  it("bearing away runs the actor off downwind", () => {
    const d = play("bearAway", 7);
    expect(d.ships.a.pose.x).toBeGreaterThan(2);
  });

  it("the mainmast falls over the side away from the shooter", () => {
    const d = play("mastFalls", 4);
    expect(d.ships.b.mast?.landed).toBe(true);
    expect(d.ships.b.mast?.angle).toBeGreaterThan(1.4);
  });

  it("a hit in the hold spills crates that float", () => {
    const d = play("cargoSpills", 6);
    expect(aliveCount(d.pools.crate)).toBe(8);
    expect([...d.pools.crate.state].filter((s) => s === 2).length).toBe(8);
  });

  it("sinking takes the target under and leaves wreckage", () => {
    const d = play("sink", 9);
    expect(d.ships.b.sunk).toBe(true);
    expect(aliveCount(d.pools.crate)).toBeGreaterThan(0);
  });

  it("reset puts the ships back and clears the sea", () => {
    const d = play("sink", 9);
    d.reset();
    expect(d.ships.b.sunk).toBe(false);
    expect(aliveCount(d.pools.crate)).toBe(0);
  });

  it("plays a queued sequence one beat after another", () => {
    const d = setup();
    d.enqueue(["broadsideLow", "mastFalls"]);
    run(d, 9);
    expect(d.ships.b.mast?.landed).toBe(true);
  });
});
