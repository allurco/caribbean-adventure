import { describe, expect, it } from "vitest";
import { gunsFromNodes, modelToShipLocal, shipSize } from "./shipGuns";
import { shipModelScale } from "../shipModels";

describe("a ship's guns, read from its model (#263)", () => {
  it("turns model metres (bow along -z) into the ship's frame (bow along +z) at ship scale", () => {
    const s = shipModelScale();
    const p = modelToShipLocal(1, 2, -3);
    expect(p.x).toBeCloseTo(-s, 9);
    expect(p.y).toBeCloseTo(2 * s, 9);
    expect(p.z).toBeCloseTo(3 * s, 9); // toward the bow
  });

  it("takes the Cannon_ nodes and nothing else", () => {
    const guns = gunsFromNodes([
      { name: "Cannon_00", x: 1, y: 1, z: 0 },
      { name: "Cannon_01", x: -1, y: 1, z: 0 },
      { name: "Cannon_Lid", x: 5, y: 5, z: 5 },
      { name: "Hull", x: 0, y: 0, z: 0 },
    ]);
    expect(guns).toHaveLength(2);
    expect(guns[0].x).toBeLessThan(0); // turned half round: the model's +x lands on the ship's -x
  });

  it("sizes each class from its model: a galleon outsizes a sloop", () => {
    const sloop = shipSize("Sloop");
    const galleon = shipSize("Galleon");
    expect(galleon.length).toBeGreaterThan(sloop.length);
    expect(galleon.masthead).toBeGreaterThan(galleon.freeboard);
  });
});
