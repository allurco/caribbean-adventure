import { afterEach, describe, expect, it, vi } from "vitest";
import { createShipFoamRegistry, SHIP_FOAM_CAP, SHIP_FOAM_FLOATS_A, SHIP_FOAM_FLOATS_B } from "./shipFoamSources";

const source = (x: number, player = false) => ({ x, z: x * 2, headingX: 0, headingZ: 1, hullLength: 0.7, speed: 0, player });

const arrays = () => ({
  a: new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_A),
  b: new Float32Array(SHIP_FOAM_CAP * SHIP_FOAM_FLOATS_B),
});

/** The x of each ship written, in array order. */
const writtenXs = (a: Float32Array, n: number) => Array.from({ length: n }, (_, i) => a[i * SHIP_FOAM_FLOATS_A]);

describe("createShipFoamRegistry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fills the uniform arrays with each ship's position and heading, and its hull length and speed", () => {
    const registry = createShipFoamRegistry();
    registry.set("a", { x: 1, z: 2, headingX: 0.6, headingZ: 0.8, hullLength: 0.65, speed: 1.5, player: true });
    const { a, b } = arrays();
    expect(registry.fill(a, b)).toBe(1);
    expect(Array.from(a.subarray(0, 4))).toEqual(Array.from(new Float32Array([1, 2, 0.6, 0.8])));
    expect(Array.from(b.subarray(0, 2))).toEqual(Array.from(new Float32Array([0.65, 1.5])));
  });

  it("updates a ship in place and drops a removed one", () => {
    const registry = createShipFoamRegistry();
    registry.set("a", source(1));
    registry.set("b", source(2));
    registry.set("a", source(3));
    const { a, b } = arrays();
    expect(registry.fill(a, b)).toBe(2);
    expect(writtenXs(a, 2)).toEqual([3, 2]);
    registry.remove("a");
    expect(registry.fill(a, b)).toBe(1);
    expect(a[0]).toBe(2);
    registry.remove("never-added");
    expect(registry.fill(a, b)).toBe(1);
  });

  it("writes the players' ships first, then the NPCs, each by id, whatever order they registered in", () => {
    const registry = createShipFoamRegistry();
    registry.set("merchant-2", source(12));
    registry.set("1", source(1, true));
    registry.set("flotilla-1", source(11));
    registry.set("0", source(0, true));
    registry.set("merchant-10", source(13));
    const { a, b } = arrays();
    expect(registry.fill(a, b)).toBe(5);
    // "merchant-10" sorts before "merchant-2" by code point: the order is fixed, not numeric.
    expect(writtenXs(a, 5)).toEqual([0, 1, 11, 13, 12]);
  });

  it("re-sorts when a ship joins, leaves or changes side, and keeps the order when one only moves", () => {
    const registry = createShipFoamRegistry();
    registry.set("npc-b", source(2));
    registry.set("npc-a", source(1));
    const { a, b } = arrays();
    expect(registry.fill(a, b)).toBe(2);
    expect(writtenXs(a, 2)).toEqual([1, 2]);
    registry.set("npc-b", source(20));
    registry.fill(a, b);
    expect(writtenXs(a, 2)).toEqual([1, 20]);
    registry.set("npc-b", source(20, true));
    registry.fill(a, b);
    expect(writtenXs(a, 2)).toEqual([20, 1]);
    registry.remove("npc-b");
    expect(registry.fill(a, b)).toBe(1);
    expect(writtenXs(a, 1)).toEqual([1]);
  });

  it("caps the count at the uniform array's size, keeping every player and the first NPCs by id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = createShipFoamRegistry();
    // Register the NPCs first so insertion order alone would starve the players.
    for (let i = 0; i < SHIP_FOAM_CAP + 5; i++) registry.set(`npc-${String(i).padStart(2, "0")}`, source(100 + i));
    for (let p = 0; p < 6; p++) registry.set(`${p}`, source(p, true));
    const { a, b } = arrays();
    expect(registry.fill(a, b)).toBe(SHIP_FOAM_CAP);
    const xs = writtenXs(a, SHIP_FOAM_CAP);
    expect(xs.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(xs.slice(6)).toEqual(Array.from({ length: SHIP_FOAM_CAP - 6 }, (_, i) => 100 + i));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(`${SHIP_FOAM_CAP + 11} ships`);
  });

  it("warns once per registry, not every frame, and not at all within the cap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = createShipFoamRegistry();
    const { a, b } = arrays();
    for (let i = 0; i < SHIP_FOAM_CAP; i++) registry.set(`npc-${i}`, source(i));
    registry.fill(a, b);
    expect(warn).not.toHaveBeenCalled();
    registry.set("one-too-many", source(99));
    registry.fill(a, b);
    registry.fill(a, b);
    registry.set("two-too-many", source(98));
    registry.fill(a, b);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("holds every ship of a six-player game with its merchants and flotillas", () => {
    expect(SHIP_FOAM_CAP).toBeGreaterThanOrEqual(24);
  });
});
