import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { hexToWorld } from "../../game/hex";
import type { GroundField } from "./groundPlacement";
import { createTerrainHeightField, SEA_LEVEL, terrainSeedFromCells } from "./terrainHeightField";
import { PIER_DECK_TOP, PIER_LENGTH } from "./pierGeometry";
import {
  pierOrigin,
  PIER_LAND_OVERLAP,
  PIER_SHORE_HEIGHT,
  PIER_SHORE_MAX,
  PIER_SHORE_MIN,
} from "./pierPlacement";
import { PROP_SCALE } from "./worldScale";
import { SHIP_HULL_BOXES } from "../shipHull";

const flat = (height: number): GroundField => ({ sampleHeight: () => height });
const centre = { x: 3, z: -2 };

describe("pierOrigin", () => {
  it("keeps the search band inside the port hex and leaves room for a docked ship", () => {
    expect(PIER_SHORE_MIN).toBeGreaterThanOrEqual(0.4);
    expect(PIER_SHORE_MIN).toBeLessThan(PIER_SHORE_MAX);
    // The docking hex centre is √3 away and a galleon's hull reaches half its length back from it; the pier is drawn at PROP_SCALE.
    expect(PIER_SHORE_MAX - PIER_LAND_OVERLAP + PIER_LENGTH * PROP_SCALE).toBeLessThanOrEqual(Math.sqrt(3) - SHIP_HULL_BOXES.Galleon[2] / 2 + 1e-9);
    expect(PIER_LAND_OVERLAP).toBeGreaterThan(0);
    expect(PIER_SHORE_HEIGHT).toBeGreaterThan(SEA_LEVEL);
    expect(PIER_SHORE_HEIGHT).toBeLessThan(PIER_DECK_TOP);
  });

  it("starts the deck a little inland of where the ground drops to the shore height", () => {
    const shore = 0.72;
    // Land slopes down to the sea at `shore` from the centre, in every direction.
    const field: GroundField = {
      sampleHeight: (x, z) => {
        const d = Math.hypot(x - centre.x, z - centre.z);
        return d < shore ? 0.3 : SEA_LEVEL;
      },
    };
    for (const rotation of [0, 1.1, Math.PI, -2.3]) {
      const origin = pierOrigin(field, centre, rotation);
      const d = Math.hypot(origin.x - centre.x, origin.z - centre.z);
      expect(d).toBeCloseTo(shore - PIER_LAND_OVERLAP, 1);
      // The origin lies along the pier's direction: +z turned by the rotation (sin, cos), like the old offset.
      expect(Math.atan2(origin.x - centre.x, origin.z - centre.z)).toBeCloseTo(Math.atan2(Math.sin(rotation), Math.cos(rotation)), 5);
    }
  });

  it("clamps to the band: a coast pushed far out buries the land end, a coast pulled in meets it", () => {
    const land = pierOrigin(flat(0.3), centre, 0.4);
    expect(Math.hypot(land.x - centre.x, land.z - centre.z)).toBeCloseTo(PIER_SHORE_MAX - PIER_LAND_OVERLAP, 6);
    const sea = pierOrigin(flat(SEA_LEVEL), centre, 0.4);
    expect(Math.hypot(sea.x - centre.x, sea.z - centre.z)).toBeCloseTo(PIER_SHORE_MIN - PIER_LAND_OVERLAP, 6);
  });

  it("on a generated map, every pier starts on the beach and ends over the water", () => {
    for (const seed of [11, 23, 47]) {
      const cells = generateMap(getMapPreset("small"), seed);
      const field = createTerrainHeightField(cells, terrainSeedFromCells(cells));
      const piers = cells.flatMap((c) =>
        (c.decorations ?? []).filter((d) => d.type === "pier").map((d) => ({ cell: c, rotation: d.rotation }))
      );
      expect(piers.length).toBeGreaterThan(0);
      for (const { cell, rotation } of piers) {
        const [hx, , hz] = hexToWorld(cell.hex);
        const origin = pierOrigin(field, { x: hx, z: hz }, rotation);
        const dir = { x: Math.sin(rotation), z: Math.cos(rotation) };
        const landEnd = field.sampleHeight(origin.x, origin.z);
        const seaEnd = field.sampleHeight(origin.x + dir.x * PIER_LENGTH, origin.z + dir.z * PIER_LENGTH);
        // The land end never floats clear of the beach by more than the toe allows.
        expect(landEnd).toBeGreaterThan(SEA_LEVEL - 1e-6);
        // The sea end is over water (or the very edge of the shallows), under the deck.
        expect(seaEnd).toBeLessThan(PIER_DECK_TOP);
      }
    }
  });
});
