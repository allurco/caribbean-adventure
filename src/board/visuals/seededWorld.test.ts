/**
 * The board's seed criteria (#158 S1, S2, S4; #165): every seeded visual is a
 * pure function of the world seed (`G.mapSeed`), a feature name and stable
 * ids. S1: the same seed draws the same world, fresh caches, worker or main
 * thread. S2: another world seed on the same cells draws another world. S4:
 * shifting one feature's sub-seed leaves every feature that does not stand
 * on it deep-equal, so adding or changing a feature never reshuffles others.
 *
 * S4 shifts one feature's stream by wrapping `subSeed`: the named feature is
 * hashed on another world seed, every other one on the real one.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createWrap, hexToWorld, type MapWrap } from "../../game/hex";
import { generateMapFor, type MapRequest } from "../../game/mapRequest";
import type { MapCell } from "../../game/types";
import { generateMapOffThread, type RunMapWorker } from "../../mapWorker/generateMapOffThread";
import { answerMapWorkerRequest } from "../../mapWorker/mapWorkerProtocol";
import { getMapPreset } from "../../game/mapConfig";
import { decorationLayout } from "./decorationLayout";
import { buildLandMesh, landSurface } from "./landMesh";
import { SEED_FEATURES, type SeedFeature } from "./seedFeatures";
import { sharedTerrainField } from "./sharedTerrainField";
import { townWorks } from "./townDetailLayout";
import { townWorksColors } from "./villageColors";
import { BUILDING_SCALE } from "./worldScale";

const shifted = vi.hoisted(() => ({ feature: null as string | null }));

vi.mock("./subSeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subSeed")>();
  return {
    ...actual,
    subSeed: (worldSeed: number, feature: string, ...ids: readonly (string | number)[]) =>
      actual.subSeed(feature === shifted.feature ? worldSeed ^ 0x2545f491 : worldSeed, feature, ...ids),
  };
});

const REQUEST: MapRequest = { mapSize: "small", mapSeed: 1 };
const WRAP: MapWrap = createWrap(getMapPreset(REQUEST.mapSize).columns);
/** Two land meshes of a small map take a couple of seconds; give them room on a loaded machine. */
const LAND_MESH_TIMEOUT = 30_000;

/** The terrain field at a fixed set of points: on land, on the seabed and across every coast. */
function fieldSamples(cells: readonly MapCell[], worldSeed: number) {
  const field = sharedTerrainField(cells, WRAP, worldSeed);
  const coast: number[] = [];
  const land: number[] = [];
  const seabed: number[] = [];
  for (const cell of cells) {
    const [cx, , cz] = hexToWorld(cell.hex);
    for (let k = 0; k < 6; k++) {
      const x = cx + 0.45 * Math.cos(k + 0.3);
      const z = cz + 0.45 * Math.sin(k + 0.3);
      coast.push(field.sampleCoastDistance(x, z));
      (field.sampleCoastDistance(x, z) > 0 ? land : seabed).push(field.sampleHeight(x, z));
    }
  }
  return { coast, land, seabed };
}

/** Everything seeded the board draws, built from scratch: fresh cells, so no per-map cache is shared. */
function world(cells: readonly MapCell[], worldSeed: number) {
  const fresh = structuredClone(cells) as MapCell[];
  const layout = decorationLayout(fresh, WRAP, worldSeed);
  const ground = landSurface(sharedTerrainField(fresh, WRAP, worldSeed));
  const works = townWorks(layout.village.ports, ground, BUILDING_SCALE, townWorksColors(), worldSeed);
  return {
    ...layout,
    village: undefined,
    villageBuildings: layout.village.buildings,
    clutter: layout.village.clutter,
    townPlans: layout.village.ports,
    works: Array.from(works.positions),
  };
}
type World = ReturnType<typeof world>;
type Output = Exclude<keyof World, "village">;
const OUTPUTS: readonly Output[] = [
  "trees",
  "rocks",
  "stones",
  "shoreBoulders",
  "piers",
  "quays",
  "buildings",
  "shrubs",
  "villageBuildings",
  "clutter",
  "townPlans",
  "works",
];

/** `world` with one feature's sub-seed shifted. */
function worldShifting(feature: SeedFeature | null, cells: readonly MapCell[], worldSeed: number): World {
  shifted.feature = feature;
  try {
    return world(cells, worldSeed);
  } finally {
    shifted.feature = null;
  }
}

/** The props the generator authored, the town and the land all keep off one another, so a feature reaches what stands on it. */
const KEEP_OUT: readonly Output[] = ["trees", "rocks", "stones", "shrubs", "shoreBoulders"];

/**
 * What each decoration feature may move: its own output and whatever stands
 * on it. The first output listed is the feature's own, which must change.
 */
const REACH: Readonly<Partial<Record<SeedFeature, readonly Output[]>>> = {
  [SEED_FEATURES.companions]: ["trees", "rocks", "shrubs"],
  [SEED_FEATURES.palmLook]: ["trees"],
  [SEED_FEATURES.rockLook]: ["rocks", "shrubs"],
  [SEED_FEATURES.smallStones]: ["stones", "shrubs"],
  [SEED_FEATURES.stoneLook]: ["stones", "shrubs"],
  [SEED_FEATURES.shrubs]: ["shrubs"],
  [SEED_FEATURES.shrubLook]: ["shrubs"],
  [SEED_FEATURES.shoreBoulders]: ["shoreBoulders"],
  [SEED_FEATURES.boulderLook]: ["shoreBoulders"],
  // The kit, the quay and the village move the town, which every prop keeps out of.
  [SEED_FEATURES.portBuildings]: ["buildings", "villageBuildings", "clutter", "townPlans", "works", ...KEEP_OUT],
  [SEED_FEATURES.quay]: ["quays", "buildings", "villageBuildings", "clutter", "townPlans", "works", ...KEEP_OUT],
  [SEED_FEATURES.village]: ["villageBuildings", "clutter", "townPlans", "works", ...KEEP_OUT],
  // Which houses a crowded town thins away (#176): the village, and the clutter and props round the footprints it frees.
  [SEED_FEATURES.villageThinning]: ["villageBuildings", "clutter", "townPlans", "works", ...KEEP_OUT],
  // The spill moves the town's cells and so the plateau it bounds, and everything in the town (#170).
  [SEED_FEATURES.townSpill]: ["townPlans", "buildings", "quays", "villageBuildings", "clutter", "works", ...KEEP_OUT],
  [SEED_FEATURES.townClutter]: ["clutter", ...KEEP_OUT],
  [SEED_FEATURES.retainingWalls]: ["works"],
  [SEED_FEATURES.kerbs]: ["works"],
};

describe("the board's seeded world (ADR 0007, #165)", () => {
  let cells: MapCell[];
  let base: World;
  beforeAll(() => {
    cells = generateMapFor(REQUEST);
    base = world(cells, REQUEST.mapSeed);
  });

  it("names every feature once, so no two share a stream", () => {
    const names = Object.values(SEED_FEATURES);
    expect(new Set(names).size).toBe(names.length);
  });

  describe("S1: the same seed draws the same world", () => {
    it("deep-equal, built again from scratch", () => {
      expect(world(cells, REQUEST.mapSeed)).toEqual(base);
      expect(fieldSamples(structuredClone(cells), REQUEST.mapSeed)).toEqual(fieldSamples(structuredClone(cells), REQUEST.mapSeed));
    });

    it("the same from the map worker's cells as from the main thread's", async () => {
      const fakeWorker: RunMapWorker = async (message) => structuredClone(answerMapWorkerRequest(structuredClone(message)));
      const offThread = await generateMapOffThread(REQUEST, fakeWorker);
      expect(world(offThread.cells, offThread.mapSeed)).toEqual(base);
    });

    it("the same land mesh, colours included", () => {
      const mesh = (seed: number) => buildLandMesh(sharedTerrainField(structuredClone(cells), WRAP, seed)).land;
      const a = mesh(REQUEST.mapSeed);
      const b = mesh(REQUEST.mapSeed);
      expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
      expect(Array.from(b.colors)).toEqual(Array.from(a.colors));
    }, LAND_MESH_TIMEOUT);
  });

  describe("S2: another world seed on the same cells draws another world", () => {
    it("moves every seeded decoration and the town, not just its float noise", () => {
      const other = world(cells, REQUEST.mapSeed + 1);
      const changed = (o: Output) => JSON.stringify(other[o]) !== JSON.stringify(base[o]);
      for (const o of OUTPUTS) expect(changed(o), o).toBe(true);
      // Measurably: the villages' house lists and the shrub counts differ, not just their last digits.
      const signature = (w: World) => w.villageBuildings.map((b) => b.variant).join(",");
      expect(signature(other)).not.toBe(signature(base));
    });

    it("draws another coastline and relief", () => {
      const a = fieldSamples(structuredClone(cells), REQUEST.mapSeed);
      const b = fieldSamples(structuredClone(cells), REQUEST.mapSeed + 1);
      expect(b.coast).not.toEqual(a.coast);
      expect(b.land).not.toEqual(a.land);
    });
  });

  describe("S4: one feature's sub-seed moves that feature and what stands on it, nothing else", () => {
    for (const [feature, reach] of Object.entries(REACH) as [SeedFeature, readonly Output[]][]) {
      it(`${feature} reaches ${reach.join(", ")} only`, () => {
        const moved = worldShifting(feature, cells, REQUEST.mapSeed);
        expect(JSON.stringify(moved[reach[0]]), `${feature} moves ${reach[0]}`).not.toBe(JSON.stringify(base[reach[0]]));
        for (const o of OUTPUTS) {
          if (!reach.includes(o)) expect(moved[o], `${feature} leaves ${o}`).toEqual(base[o]);
        }
      });
    }

    it("covers every decoration and town feature", () => {
      const terrain: readonly SeedFeature[] = [SEED_FEATURES.coastNoise, SEED_FEATURES.reliefNoise, SEED_FEATURES.reefNoise, SEED_FEATURES.landBandNoise];
      // A ship's resting heading is seeded per ship, not laid out with the map (shipSpawnHeading.test.ts covers it).
      const ships: readonly SeedFeature[] = [SEED_FEATURES.shipSpawnHeading];
      const all = Object.values(SEED_FEATURES).filter((f) => !terrain.includes(f) && !ships.includes(f));
      expect(Object.keys(REACH).sort()).toEqual([...all].sort());
    });

    it("the terrain's three noises each keep to their own term: coast, relief on land, reef on the seabed", () => {
      const shift = (feature: SeedFeature) => {
        shifted.feature = feature;
        try {
          return fieldSamples(structuredClone(cells), REQUEST.mapSeed);
        } finally {
          shifted.feature = null;
        }
      };
      const a = fieldSamples(structuredClone(cells), REQUEST.mapSeed);
      const relief = shift(SEED_FEATURES.reliefNoise);
      expect(relief.coast).toEqual(a.coast);
      expect(relief.seabed).toEqual(a.seabed);
      expect(relief.land).not.toEqual(a.land);
      const reef = shift(SEED_FEATURES.reefNoise);
      expect(reef.coast).toEqual(a.coast);
      expect(reef.land).toEqual(a.land);
      expect(reef.seabed).not.toEqual(a.seabed);
      const coast = shift(SEED_FEATURES.coastNoise);
      expect(coast.coast).not.toEqual(a.coast);
    });

    it("the town spill moves the land only round the ports, never the coast or the seabed (#170)", () => {
      const field = (feature: SeedFeature | null) => {
        shifted.feature = feature;
        try {
          return sharedTerrainField(structuredClone(cells), WRAP, REQUEST.mapSeed);
        } finally {
          shifted.feature = null;
        }
      };
      const a = field(null);
      const b = field(SEED_FEATURES.townSpill);
      expect(b.townPlateaus.map((p) => p.town)).not.toEqual(a.townPlateaus.map((p) => p.town));
      const unshifted = fieldSamples(structuredClone(cells), REQUEST.mapSeed);
      shifted.feature = SEED_FEATURES.townSpill;
      let moved: ReturnType<typeof fieldSamples>;
      try {
        moved = fieldSamples(structuredClone(cells), REQUEST.mapSeed);
      } finally {
        shifted.feature = null;
      }
      expect(moved.coast).toEqual(unshifted.coast);
      expect(moved.seabed).toEqual(unshifted.seabed);
      // Away from every town's reach the land is untouched.
      const ports = cells.filter((c) => c.hasPort).map((c) => hexToWorld(c.hex));
      for (const cell of cells) {
        if (cell.terrain !== "island") continue;
        const [x, , z] = hexToWorld(cell.hex);
        if (ports.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
        expect(b.sampleHeight(x, z)).toBe(a.sampleHeight(x, z));
      }
    });

    it("the land mesh's band noise recolours the land and moves nothing", () => {
      const mesh = (feature: SeedFeature | null) => {
        shifted.feature = feature;
        try {
          return buildLandMesh(sharedTerrainField(structuredClone(cells), WRAP, REQUEST.mapSeed)).land;
        } finally {
          shifted.feature = null;
        }
      };
      const a = mesh(null);
      const b = mesh(SEED_FEATURES.landBandNoise);
      expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
      expect(Array.from(b.colors)).not.toEqual(Array.from(a.colors));
      // And no decoration or town stands on it.
      expect(worldShifting(SEED_FEATURES.landBandNoise, cells, REQUEST.mapSeed)).toEqual(base);
    }, LAND_MESH_TIMEOUT);
  });
});
