import { describe, expect, it } from "vitest";
import { CLOSE_IN_APPROACH_GAP, bearAwayPath, sharedBeamHeading, bearingHeading, closeInPath, downwindHeading, forward, hullsOverlap, pathPose, rakePath, sideOf, starboard, turnHeading, type ShipPose } from "./shipPaths";

const at = (x: number, z: number, heading: number): ShipPose => ({ x, z, heading });
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe("ship frame", () => {
  it("heading 0 points the bow along +z, with starboard toward -x (Ship.tsx's convention)", () => {
    const [fx, fz] = forward(0);
    close(fx, 0);
    close(fz, 1);
    const [sx, sz] = starboard(0);
    close(sx, -1);
    close(sz, 0);
  });
});

describe("rake", () => {
  // Defender at the origin sailing +z; the attacker one hex off its port beam, sailing the same way.
  const defender = at(0, 0, 0);
  const attacker = at(Math.sqrt(3), 0, 0);
  const rake = rakePath(attacker, defender, { attackerLength: 0.9, defenderLength: 0.9 });

  it("starts where the attacker is, on its heading", () => {
    const p = pathPose(rake.attacker, 0);
    close(p.x, attacker.x);
    close(p.z, attacker.z);
    expect(angleGap(p.heading, 0)).toBeLessThan(1e-3);
  });

  it("crosses astern of the defender, square across its stern, when it fires", () => {
    const p = pathPose(rake.attacker, rake.fireAt);
    expect(p.z).toBeLessThan(-0.45); // behind the stern (stern at z = -0.45)
    close(p.x, 0, 1e-6);
    // Moving across the defender's line: heading along ±x.
    expect(Math.abs(Math.abs(p.heading) - Math.PI / 2)).toBeLessThan(1e-3);
  });

  it("ends on the defender's other side", () => {
    const p = pathPose(rake.attacker, 1);
    expect(p.x).toBeLessThan(0);
  });

  it("heels the attacker while it turns, and not on a straight", () => {
    const heels = Array.from({ length: 20 }, (_, i) => Math.abs(pathPose(rake.attacker, (i / 20) * rake.fireAt).heel));
    expect(Math.max(...heels)).toBeGreaterThan(0.05);
    const straight = pathPose(rake.defender, 0.5);
    close(straight.heel, 0);
  });
});

describe("close in", () => {
  it("brings the attacker alongside the defender, parallel and a small gap apart", () => {
    const defender = at(0, 0, 0);
    const attacker = at(Math.sqrt(3), 0, Math.PI / 6);
    const path = closeInPath(attacker, defender, { attackerBeam: 0.24, defenderBeam: 0.3, gap: 0.04 });
    const a = pathPose(path.attacker, 1);
    const d = pathPose(path.defender, 1);
    expect(angleGap(a.heading, d.heading)).toBeLessThan(1e-3);
    // Abeam: no fore-aft offset, and the hulls 0.24/2 + 0.3/2 + 0.04 apart.
    const [fx, fz] = forward(d.heading);
    close((a.x - d.x) * fx + (a.z - d.z) * fz, 0, 1e-6);
    close(Math.hypot(a.x - d.x, a.z - d.z), 0.31, 1e-6);
    expect(a.x).toBeGreaterThan(d.x); // on the side it came from
  });
});

describe("bear away", () => {
  it("turns the ship to run straight downwind", () => {
    const toward: [number, number] = [Math.cos(0.4), Math.sin(0.4)];
    const ship = at(0, 0, Math.PI);
    const end = pathPose(bearAwayPath(ship, toward), 1);
    expect(angleGap(end.heading, downwindHeading(toward))).toBeLessThan(1e-3);
    const [fx, fz] = forward(end.heading);
    close(fx, toward[0], 1e-6);
    close(fz, toward[1], 1e-6);
    // and has run off downwind
    expect(end.x * toward[0] + end.z * toward[1]).toBeGreaterThan(1);
  });
});

describe("turning to bear", () => {
  it("lays the ship square to the enemy, beam on, the nearer way round", () => {
    const ship = at(0, 0, 0.3);
    const enemy = { x: 0, z: 2 }; // dead ahead
    const h = bearingHeading(ship, enemy);
    // Beam on: the bearing to the enemy is square to the keel.
    const [fx, fz] = forward(h);
    close(fx * enemy.x + fz * enemy.z, 0);
    // The nearer of the two beam-on headings to its own.
    expect(angleGap(h, Math.PI / 2)).toBeLessThan(1e-9);
  });

  it("lays two ships beam-on side by side on one heading, the one that turns them least", () => {
    const a = at(0, 0, 0.2);
    const b = at(2, 0, Math.PI - 0.5); // enemy to the east, sailing nearly the other way
    const h = sharedBeamHeading(a, b);
    const [fx] = forward(h);
    close(fx, 0); // square to the line between them
    // To 0: a turns 0.2 and b π - 0.5; to π: a turns π - 0.2 and b 0.5. 0 turns them less.
    expect(angleGap(h, 0)).toBeLessThan(1e-9);
    expect(angleGap(sharedBeamHeading(at(0, 0, 3), at(2, 0, 2.9)), Math.PI)).toBeLessThan(1e-9);
  });

  it("turns by the short way, at an even pace", () => {
    close(turnHeading(0.1, 6.2, 1), 6.2 - 2 * Math.PI, 1e-9);
    close(turnHeading(0.1, -0.1, 0.5), 0, 1e-9);
    close(turnHeading(3, 1, 0), 3);
  });
});

describe("hulls never pass through each other", () => {
  const SIZE = { length: 0.9, beam: 0.25 };
  it("knows two hulls that touch from two that do not", () => {
    expect(hullsOverlap({ ...at(0, 0, 0), ...SIZE }, { ...at(0.2, 0, 0), ...SIZE })).toBe(true);
    expect(hullsOverlap({ ...at(0, 0, 0), ...SIZE }, { ...at(0.3, 0, 0), ...SIZE })).toBe(false);
    // End to end, crossed: the bow of one through the waist of the other.
    expect(hullsOverlap({ ...at(0, 0, 0), ...SIZE }, { ...at(0, 0.5, Math.PI / 2), ...SIZE })).toBe(true);
  });

  it("closing alongside (into the approach gap the grapples haul shut), from beam-on, stays clear of the defender all the way in", () => {
    const sqrt3 = Math.sqrt(3);
    // Six bearings round the defender, one hex off, both ships turned beam-on (as the declaration leaves them).
    for (let k = 0; k < 12; k++) {
      const bearing = (k * Math.PI) / 6 + Math.PI / 6;
      const defender0 = at(0, 0, 0);
      const attacker0 = at(sqrt3 * Math.sin(bearing), sqrt3 * Math.cos(bearing), 0);
      const defender = at(0, 0, bearingHeading(defender0, attacker0));
      const attacker = at(attacker0.x, attacker0.z, bearingHeading(attacker0, defender));
      const paths = closeInPath(attacker, defender, { attackerBeam: SIZE.beam, defenderBeam: SIZE.beam, gap: CLOSE_IN_APPROACH_GAP });
      for (let i = 0; i <= 60; i++) {
        const a = pathPose(paths.attacker, i / 60);
        const d = pathPose(paths.defender, i / 60);
        expect(hullsOverlap({ ...a, ...SIZE }, { ...d, ...SIZE })).toBe(false);
      }
      const end = pathPose(paths.attacker, 1);
      expect(sideOf(pathPose(paths.defender, 1), end)).toBe(sideOf(defender, attacker));
    }
  });
});
