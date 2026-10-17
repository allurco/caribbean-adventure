import { describe, expect, it } from "vitest";
import { labFace, labFaces } from "./cardLabFaces";

describe("the event card lab's faces (#247)", () => {
  it("lays out every kind, the flagged ones once per nation", () => {
    const faces = labFaces();
    expect(faces.filter((f) => f.art === "flotillaPatrol").map((f) => f.nation)).toEqual(["England", "France", "Spain", "Netherlands"]);
    expect(faces.filter((f) => f.art === "lostFlag").map((f) => f.nation)).toEqual(["England", "France", "Spain", "Netherlands", "Pirate"]);
    expect(faces.filter((f) => f.art === "storm")).toHaveLength(1);
    expect(new Set(faces.map((f) => f.id)).size).toBe(faces.length);
  });

  it("a card with no flag flies none; a flagged one without a nation flies England's", () => {
    expect(labFace("storm", "Spain").nation).toBeNull();
    expect(labFace("flotillaPatrol", null).nation).toBe("England");
    expect(labFace("lostFlag", "Pirate").nation).toBe("Pirate");
  });
});
