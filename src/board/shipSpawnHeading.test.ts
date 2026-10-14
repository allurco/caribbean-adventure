import { describe, expect, it } from "vitest";
import { hex, hexToWorld, type Hex } from "../game/hex";
import { SPAWN_HEADING_JITTER, spawnHeading } from "./shipSpawnHeading";
import { angleDelta } from "./shipMotion";

const headingTo = (h: Hex): number => {
  const [x, , z] = hexToWorld(h);
  return Math.atan2(x, z);
};

describe("spawnHeading", () => {
  it("faces the open sea: the one direction with water along it", () => {
    // Land everywhere but a channel running from the origin toward (1, -1).
    const isWater = (h: Hex) => h.q >= 1 && h.q === -h.r;
    for (const id of ["0", "1", "npc-7"]) {
      const heading = spawnHeading(42, id, hex(0, 0), isWater, null);
      expect(Math.abs(angleDelta(heading, headingTo(hex(1, -1))))).toBeLessThanOrEqual(SPAWN_HEADING_JITTER + 1e-9);
    }
  });

  it("prefers the longer reach of water", () => {
    // Water one hex toward (0, 1), three toward (-1, 0).
    const isWater = (h: Hex) => (h.q === 0 && h.r === 1) || (h.r === 0 && h.q < 0 && h.q >= -3);
    const heading = spawnHeading(7, "0", hex(0, 0), isWater, null);
    expect(Math.abs(angleDelta(heading, headingTo(hex(-1, 0))))).toBeLessThanOrEqual(SPAWN_HEADING_JITTER + 1e-9);
  });

  it("is the same for the same seed and ship, and varies between ships in open sea", () => {
    const sea = () => true;
    expect(spawnHeading(3, "0", hex(2, 2), sea, null)).toBe(spawnHeading(3, "0", hex(2, 2), sea, null));
    const headings = new Set(["0", "1", "2", "3", "4", "5"].map((id) => spawnHeading(3, id, hex(2, 2), sea, null).toFixed(3)));
    expect(headings.size).toBeGreaterThan(1);
  });

  it("still gives a heading when the ship is boxed in by land", () => {
    expect(Number.isFinite(spawnHeading(1, "0", hex(0, 0), () => false, null))).toBe(true);
  });
});
