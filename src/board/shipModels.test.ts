import { describe, it, expect } from "vitest";
import { SHIP_CLASSES } from "../game/types";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";
import { SHIP_MODEL_ROTATION_Y, shipModel, shipModelScale, shipModelUrl } from "./shipModels";

/** Where a model-frame direction (x, z) points after the model is turned by `rotationY` about +Y. */
const turn = (x: number, z: number, rotationY: number): [number, number] => [
  x * Math.cos(rotationY) + z * Math.sin(rotationY),
  -x * Math.sin(rotationY) + z * Math.cos(rotationY),
];

describe("ship model catalogue", () => {
  it("answers every ship class", () => {
    for (const shipClass of SHIP_CLASSES) expect(shipModel(shipClass)).not.toBeUndefined();
  });

  it("has a model for the Frigate, 38 m overall without the bowsprit", () => {
    const frigate = shipModel("Frigate");
    expect(frigate).not.toBeNull();
    expect(frigate?.lengthMetres).toBe(38);
  });

  it("has a model for the Galleon, 34 m overall without the bowsprit", () => {
    expect(shipModel("Galleon")?.lengthMetres).toBe(34);
  });

  it("has a model for the Sloop, 18 m overall without the bowsprit", () => {
    expect(shipModel("Sloop")?.lengthMetres).toBe(18);
  });

  it("has a model for the Flute, 30 m overall without the bowsprit", () => {
    expect(shipModel("Flute")?.lengthMetres).toBe(30);
  });

  it("has a model for every ship class", () => {
    for (const shipClass of SHIP_CLASSES) expect(shipModel(shipClass)).not.toBeNull();
  });

  it("reports no model for a ship without a class", () => {
    expect(shipModel(undefined)).toBeNull();
  });

  it("draws the Frigate its real length in metres, at ship scale", () => {
    const frigate = shipModel("Frigate")!;
    // 38 m at 65 m a unit, twice true scale for the 350 m hex: about 0.384 units.
    expect(frigate.lengthMetres * shipModelScale()).toBeCloseTo(metresToUnits(38) * SHIP_SCALE, 10);
    expect(frigate.lengthMetres * shipModelScale()).toBeCloseTo(0.3842, 3);
  });

  it("turns the model's bow (glTF −Z) onto the board's heading (+Z)", () => {
    const [x, z] = turn(0, -1, SHIP_MODEL_ROTATION_Y);
    expect(x).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(1, 10);
  });

  it("names the parts the game relies on", () => {
    expect(shipModel("Frigate")!.parts).toEqual({ hull: "Hull", sails: "Sails", flag: "Jolly_Roger" });
    expect(shipModel("Galleon")!.parts).toEqual({ hull: "Hull", sails: "Sails", flag: "Jolly_Roger" });
    expect(shipModel("Sloop")!.parts).toEqual({ hull: "Hull", sails: "Sails", flag: "Jolly_Roger" });
    expect(shipModel("Flute")!.parts).toEqual({ hull: "Hull", sails: "Sails", flag: "Jolly_Roger" });
  });

  it("tints the Frigate's sails by part name, not the flag that shares their canvas", () => {
    const frigate = shipModel("Frigate")!;
    expect(frigate.tintedParts).toContain("Sails");
    expect(frigate.tintedParts).not.toContain("Jolly_Roger");
  });

  it("serves the model under the app's base path", () => {
    const frigate = shipModel("Frigate")!;
    expect(shipModelUrl(frigate, "/")).toBe("/ships/frigate.glb");
    expect(shipModelUrl(frigate, "/caribbean/")).toBe("/caribbean/ships/frigate.glb");
  });
});
