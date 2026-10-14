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

  it("has a model for the Galleon, 42 m overall without the bowsprit", () => {
    expect(shipModel("Galleon")?.lengthMetres).toBe(42);
  });

  it("draws the Galleon clearly longer than the Frigate (#163)", () => {
    expect(shipModel("Galleon")!.lengthMetres).toBeGreaterThan(shipModel("Frigate")!.lengthMetres + 3);
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
    // 38 m at 65 m a unit, at the diorama ship scale (ADR 0006).
    expect(frigate.lengthMetres * shipModelScale()).toBeCloseTo(metresToUnits(38) * SHIP_SCALE, 10);
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

  it("tints every class's pennant, hull stripe and main-course band, the owner-colour parts (#134)", () => {
    for (const shipClass of SHIP_CLASSES) {
      expect(shipModel(shipClass)!.tintedParts).toEqual(["Pennant", "Hull_Stripe", "Sail_Band"]);
    }
  });

  it("never tints the sails, the hull, the deck, the rigging or the flag, which flies a nation (#134)", () => {
    for (const shipClass of SHIP_CLASSES) {
      const model = shipModel(shipClass)!;
      for (const part of ["Sails", "Sail_Patches", "Hull", "Deck_Main", "Rigging", model.parts.flag]) {
        expect(model.tintedParts).not.toContain(part);
      }
    }
  });

  it("has nothing to tint on a class without a model", () => {
    expect(shipModel(undefined)).toBeNull();
  });

  it("serves the model under the app's base path", () => {
    const frigate = shipModel("Frigate")!;
    expect(shipModelUrl(frigate, "/")).toBe("/ships/frigate.glb");
    expect(shipModelUrl(frigate, "/caribbean/")).toBe("/caribbean/ships/frigate.glb");
  });
});
