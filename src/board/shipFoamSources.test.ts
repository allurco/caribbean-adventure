import { describe, expect, it } from "vitest";
import { createShipFoamRegistry, SHIP_FOAM_CAP, SHIP_FOAM_FLOATS_A, SHIP_FOAM_FLOATS_B } from "./shipFoamSources";

const source = (x: number) => ({ x, z: x * 2, headingX: 0, headingZ: 1, hullLength: 0.7, speed: 0 });

describe("createShipFoamRegistry", () => {
  it("fills the uniform arrays with each ship's position and heading, and its hull length and speed", () => {
    const registry = createShipFoamRegistry();
    registry.set("a", { x: 1, z: 2, headingX: 0.6, headingZ: 0.8, hullLength: 0.65, speed: 1.5 });
    const a = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_A);
    const b = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_B);
    expect(registry.fill(a, b)).toBe(1);
    expect(Array.from(a.subarray(0, 4))).toEqual(Array.from(new Float32Array([1, 2, 0.6, 0.8])));
    expect(Array.from(b.subarray(0, 2))).toEqual(Array.from(new Float32Array([0.65, 1.5])));
  });

  it("updates a ship in place and drops a removed one", () => {
    const registry = createShipFoamRegistry();
    registry.set("a", source(1));
    registry.set("b", source(2));
    registry.set("a", source(3));
    const a = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_A);
    const b = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_B);
    expect(registry.fill(a, b)).toBe(2);
    const xs = [a[0], a[SHIP_FOAM_FLOATS_A]].sort();
    expect(xs).toEqual([2, 3]);
    registry.remove("a");
    expect(registry.fill(a, b)).toBe(1);
    expect(a[0]).toBe(2);
    registry.remove("never-added");
    expect(registry.fill(a, b)).toBe(1);
  });

  it("caps the count at the uniform array's size", () => {
    const registry = createShipFoamRegistry();
    for (let i = 0; i < SHIP_FOAM_CAP + 5; i++) registry.set(`s${i}`, source(i));
    const a = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_A);
    const b = new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_B);
    expect(registry.fill(a, b)).toBe(SHIP_FOAM_CAP);
  });

  it("holds every ship of a six-player game with its merchants and flotillas", () => {
    expect(SHIP_FOAM_CAP).toBeGreaterThanOrEqual(24);
  });
});
