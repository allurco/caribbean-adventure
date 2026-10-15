import { describe, expect, it } from "vitest";
import { bearAwayPath, closeInPath, downwindHeading, forward, pathPose, rakePath, starboard, type ShipPose } from "./shipPaths";

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
