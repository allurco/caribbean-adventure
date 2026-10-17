import { describe, expect, it } from "vitest";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT, AGED_BUILDING_PLAN } from "./visuals/agedBuildingGeometry";
import { BUILDING_FOOTING } from "./visuals/buildingGeometry";
import { familyScaleOf } from "./visuals/portSettlement";
import { BUILDING_SCALE } from "./visuals/worldScale";
import { TOWN_MODEL_UNITS_PER_METRE, TOWN_MODELS, townModelFor, townModelUrl } from "./townModels";

const tavern = TOWN_MODELS.tavern;

describe("the town model catalogue", () => {
  // The model takes the place the layout already keeps for the tavern (#394):
  // the code-built footprint, height, footing and plan circle, at scale 1, in metres.
  it("states the tavern at the code-built tavern's plan, in metres", () => {
    const metres = (units: number) => units / TOWN_MODEL_UNITS_PER_METRE;
    expect(tavern.halfWidthMetres).toBeCloseTo(metres(AGED_BUILDING_PLAN.tavern.halfW), 6);
    expect(tavern.halfDepthMetres).toBeCloseTo(metres(AGED_BUILDING_PLAN.tavern.halfD), 6);
    expect(tavern.heightMetres).toBeCloseTo(metres(AGED_BUILDING_HEIGHT.tavern), 6);
    expect(tavern.footingMetres).toBeCloseTo(metres(BUILDING_FOOTING), 6);
    expect(tavern.reachMetres).toBeCloseTo(metres(AGED_BUILDING_HALF_DIAGONAL.tavern), 6);
  });

  it("puts 65 m in one unit, as the water and the code-built pieces do (ADR 0003)", () => {
    expect(TOWN_MODEL_UNITS_PER_METRE).toBeCloseTo(1 / 65, 10);
  });

  it("draws each piece at its family's factor, the one the layout scales it by (ADR 0006)", () => {
    expect(tavern.factor).toBe(BUILDING_SCALE);
    expect(tavern.factor).toBe(familyScaleOf(tavern.kind));
  });

  it("holds the tavern to the PRD's budget and names its anchors", () => {
    expect(tavern.maxTriangles).toBe(1800);
    expect(tavern.anchors).toContain("Chimney_00");
    expect(tavern.anchors.filter((a) => a.startsWith("Window_")).length).toBeGreaterThan(0);
  });

  it("serves the file from public/town/ under the app's base path", () => {
    expect(townModelUrl(tavern, "/")).toBe("/town/tavern.glb");
    expect(townModelUrl(tavern, "/game/")).toBe("/game/town/tavern.glb");
  });

  it("gives the tavern its model and leaves every other kind code-built", () => {
    expect(townModelFor("tavern")).toBe(tavern);
    for (const kind of ["house", "warehouse", "watchtower", "church"] as const) expect(townModelFor(kind)).toBeNull();
  });
});
