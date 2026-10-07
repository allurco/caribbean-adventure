import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset, type MapSizeId } from "../../game/mapConfig";
import { createWrap, hexToWorld } from "../../game/hex";
import { terrainSeedFromCells } from "./terrainHeightField";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { groundTopY } from "./groundPlacement";
import { portBuildings, PORT_SETTLEMENT_RADIUS, type PortBuilding } from "./portSettlement";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { PORT_GROUND_PROBE_RADIUS, PORT_HOVER_MARGIN, PORT_HOVER_RADIUS, portHoverVolume } from "./portHover";
import { BUILDING_SCALE } from "./worldScale";

/** The building cap and the margin, at the buildings' scale. */
const CAP = BUILDING_MAX_HEIGHT * BUILDING_SCALE;
const MARGIN = PORT_HOVER_MARGIN * BUILDING_SCALE;

const SAMPLES: readonly [MapSizeId, number][] = [
  ["small", 1],
  ["small", 2],
  ["small", 3],
  ["medium", 1],
  ["large", 1],
];

describe("portHoverVolume", () => {
  it("covers the settlement's envelope: every building's foot and top, out to the settlement radius", () => {
    expect(PORT_HOVER_RADIUS).toBe(PORT_SETTLEMENT_RADIUS);
    let ports = 0;
    let followsBuildings = 0;
    for (const [size, seed] of SAMPLES) {
      const preset = getMapPreset(size);
      const wrap = createWrap(preset.columns);
      const cells = generateMap(preset, seed, wrap);
      const field = sharedTerrainField(cells, wrap);
      const buildings = portBuildings(cells, landSurface(field), terrainSeedFromCells(cells));
      for (const cell of cells) {
        if (!cell.hasPort) continue;
        ports++;
        const [x, , z] = hexToWorld(cell.hex);
        const groundY = groundTopY(field, x, z, PORT_GROUND_PROBE_RADIUS);
        const volume = portHoverVolume({ x, z }, groundY, buildings);
        // The ground the probe found, and the cap's worth of air over it, as before.
        expect(volume.bottom).toBeLessThanOrEqual(groundY);
        expect(volume.top).toBeGreaterThanOrEqual(groundY + CAP);
        if (volume.top > groundY + CAP + MARGIN + 1e-9 || volume.bottom < groundY - MARGIN - 1e-9) followsBuildings++;
        const own = buildings.filter((b) => Math.hypot(b.worldX - x, b.worldZ - z) <= PORT_HOVER_RADIUS);
        expect(own.length).toBeGreaterThan(0);
        for (const b of own) {
          const top = b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale;
          expect(b.worldY).toBeGreaterThanOrEqual(volume.bottom);
          expect(top).toBeLessThanOrEqual(volume.top);
          expect(Math.hypot(b.worldX - x, b.worldZ - z) + AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale).toBeLessThanOrEqual(volume.radius + 1e-9);
        }
      }
    }
    expect(ports).toBeGreaterThan(20);
    // The buildings stand by the quay, down the beach from the centre's ground (or, on a beach rising
    // inland, a tower above it plus the cap): the volume follows them rather than the cap alone.
    expect(followsBuildings).toBeGreaterThan(0);
  });

  it("falls back to the cap over the probed ground when a port has no buildings, with the margin either way", () => {
    const volume = portHoverVolume({ x: 0, z: 0 }, 0.2, []);
    expect(volume.bottom).toBeCloseTo(0.2 - MARGIN, 9);
    expect(volume.top).toBeCloseTo(0.2 + CAP + MARGIN, 9);
    expect(volume.radius).toBe(PORT_HOVER_RADIUS);
  });

  it("ignores another port's buildings (farther than the settlement radius)", () => {
    const far: PortBuilding = { kind: "watchtower", worldX: 2, worldY: 1, worldZ: 0, yaw: 0, scale: 1, tint: 1 };
    const here: PortBuilding = { kind: "house", worldX: 0.3, worldY: -0.3, worldZ: 0, yaw: 0, scale: 1, tint: 1 };
    const volume = portHoverVolume({ x: 0, z: 0 }, 0.1, [far, here]);
    expect(volume.bottom).toBeCloseTo(-0.3 - MARGIN, 9);
    expect(volume.top).toBeCloseTo(0.1 + CAP + MARGIN, 9);
  });
});
