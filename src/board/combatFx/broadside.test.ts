import { describe, expect, it } from "vitest";
import { aimPoint, gunForShot, gunsOnSide, lurchRoll, muzzleOf, recoilRoll, rippleTimes, shotArc } from "./broadside";
import { stream as mulberry32 } from "../visuals/variationStream";

// Ship-local units: bow +z, starboard -x.
const GUNS = [
  { x: -0.1, y: 0.05, z: 0.2 },
  { x: 0.1, y: 0.05, z: 0.2 },
  { x: -0.1, y: 0.05, z: -0.2 },
  { x: 0.1, y: 0.05, z: -0.2 },
  { x: -0.1, y: 0.05, z: 0 },
];
const TARGET = { length: 0.9, beam: 0.24, freeboard: 0.05, masthead: 0.84 };

describe("broadside", () => {
  it("fires the guns on the side facing the target, stern to bow", () => {
    expect(gunsOnSide(GUNS, 1).map((g) => g.z)).toEqual([-0.2, 0, 0.2]);
    expect(gunsOnSide(GUNS, -1).every((g) => g.x > 0)).toBe(true);
  });

  it("puts the muzzle outboard of the gun", () => {
    expect(muzzleOf(GUNS[0], 1, 0.03).x).toBeCloseTo(-0.13, 6);
    expect(muzzleOf(GUNS[1], -1, 0.03).x).toBeCloseTo(0.13, 6);
  });

  it("ripples the guns one after another", () => {
    expect(rippleTimes(3, 0.1)).toEqual([0, 0.1, 0.2]);
  });

  it("aims high into the rigging and low at the waterline, on the side facing the shooter", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const high = aimPoint("high", TARGET, 1, true, rng);
      expect(high.y).toBeGreaterThan(TARGET.freeboard + 0.15);
      const low = aimPoint("low", TARGET, 1, true, rng);
      expect(low.y).toBeLessThan(TARGET.freeboard);
      expect(low.x).toBeLessThanOrEqual(-TARGET.beam / 2 + 1e-9); // the shooter is on the target's starboard (-x) side
    }
  });

  it("a shot the rules call a miss falls in the sea, clear of the hull", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 20; i++) {
      const miss = aimPoint("low", TARGET, 1, false, rng);
      expect(miss.hit).toBe(false);
      expect(miss.y).toBe(0);
      expect(Math.abs(miss.x)).toBeGreaterThan(TARGET.beam / 2);
    }
  });

  it("spreads fewer shots than guns along the side, and goes round again with more", () => {
    expect([0, 1].map((s) => gunForShot(s, 2, 8))).toEqual([2, 6]);
    expect([0, 1, 2, 3, 4].map((s) => gunForShot(s, 5, 3))).toEqual([0, 1, 2, 0, 1]);
    expect(gunForShot(0, 1, 0)).toBe(-1);
  });

  it("a ship struck lurches away from the blow, then steadies", () => {
    expect(lurchRoll(0, 1)).toBe(0);
    expect(lurchRoll(0.2, 1)).toBeLessThan(0); // struck on starboard, she heels to port (roll positive lifts port)
    expect(lurchRoll(0.2, -1)).toBeGreaterThan(0);
    expect(Math.abs(lurchRoll(4, 1))).toBeLessThan(1e-3);
  });

  it("rakes at the stern", () => {
    const rng = mulberry32(3);
    const p = aimPoint("rake", TARGET, 1, true, rng);
    expect(p.z).toBeLessThan(-TARGET.length / 2 + 0.05);
  });

  it("a shot flies from the muzzle to its mark over an arc", () => {
    const from = { x: 0, y: 0.05, z: 0 };
    const to = { x: 1.7, y: 0.05, z: 0 };
    const out = { x: 0, y: 0, z: 0 };
    shotArc(from, to, 0, 0.1, out);
    expect(out).toEqual(from);
    shotArc(from, to, 0.5, 0.1, out);
    expect(out.x).toBeCloseTo(0.85, 6);
    expect(out.y).toBeCloseTo(0.15, 6);
    shotArc(from, to, 1, 0.1, out);
    expect(out.x).toBeCloseTo(1.7, 6);
  });

  it("the recoil heels the ship away from its guns, then dies away", () => {
    expect(recoilRoll(0, 1)).toBe(0);
    expect(recoilRoll(0.25, 1)).toBeLessThan(0); // firing to starboard dips the port side
    expect(recoilRoll(0.25, -1)).toBeGreaterThan(0);
    expect(Math.abs(recoilRoll(6, 1))).toBeLessThan(1e-3);
  });
});
