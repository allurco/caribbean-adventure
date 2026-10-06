import { describe, it, expect } from "vitest";
import type { Biome } from "../../game/types";
import { MIN_GROUND_HEIGHT, placeOnGround, type GroundField } from "./groundPlacement";
import { placeRock, ROCK_MAX_SLOPE, ROCK_SINK, type RockRequest } from "./rockPlacement";
import {
  ROCK_MAX_EXTENT,
  rockDrawnHeight,
  rockDrawnRadius,
  rockSizeClass,
  rockVariation,
  type RockVariation,
} from "./rockVariation";

/** A cone-shaped summit: `height` at the origin, falling `fall` per unit of distance. */
const peak = (height: number, fall: number): GroundField => ({
  sampleHeight: (x, z) => height - fall * Math.hypot(x, z),
});
/** Flat land at 0.4 for x < `coastX`, water beyond it. */
const coast = (coastX: number): GroundField => ({
  sampleHeight: (x) => (x < coastX ? 0.4 : -0.3),
});
const tilted = (height: number, slopeX: number): GroundField => ({
  sampleHeight: (x) => height + slopeX * x,
});

const ORIGIN = { x: 0, z: 0 };

const request = (scale: number, biome: Biome, rotation = 0): RockRequest => ({ scale, rotation, biome });

/** The rock's variation once it stands at `spot`, exactly as `Rocks.tsx` derives it from the layout. */
function drawnAt(spot: { x: number; y: number; z: number }, rock: RockRequest): RockVariation {
  return rockVariation(
    { worldX: spot.x, worldY: spot.y, worldZ: spot.z, rotation: rock.rotation, scale: rock.scale, biome: rock.biome },
    rock.sizeClass ?? rockSizeClass(rock.biome)
  );
}

/** World Y of the rock's top and of its widest ring (the drawn rim), as `RockVariantMesh` places it. */
function drawnHeights(spot: { y: number }, v: RockVariation) {
  const origin = spot.y - v.bury * v.scale[1];
  return { rim: origin, top: origin + rockDrawnHeight(v) };
}

describe("placeRock", () => {
  it("keeps a large outcrop's top above the ground at its centre on a steep summit", () => {
    // Stormwatch Point's summit: ~1.4 high, falling 1.5 units per unit outwards.
    const field = peak(1.4, 1.5);
    for (const scale of [0.8, 1.2, 1.6]) {
      for (let i = 0; i < 12; i++) {
        const rock = request(scale, "ROCK", i * 0.52);
        const spot = placeRock(field, { x: 0.1, z: -0.05 }, ORIGIN, rock);
        expect(spot).not.toBeNull();
        const v = drawnAt(spot!, rock);
        expect(drawnHeights(spot!, v).top).toBeGreaterThan(field.sampleHeight(spot!.x, spot!.z));
        // Most of the rock shows: the origin is only the sink (and the bury) below the ground at its centre.
        expect(spot!.y).toBeCloseTo(field.sampleHeight(spot!.x, spot!.z) - ROCK_SINK);
      }
    }
  });

  it("would bury the same outcrop under the lowest-probe rule (the #53 regression)", () => {
    const field = peak(1.4, 1.5);
    const rock = request(1.2, "ROCK");
    const v = drawnAt({ x: 0.1, y: 0, z: -0.05 }, rock);
    const lowest = placeOnGround(field, { x: 0.1, z: -0.05 }, ORIGIN, {
      footprintRadius: rockDrawnRadius(v),
      sink: ROCK_SINK,
      maxSlope: ROCK_MAX_SLOPE,
      standOn: "lowest",
    });
    expect(lowest).not.toBeNull();
    expect(drawnHeights(lowest!, drawnAt(lowest!, rock)).top).toBeLessThan(field.sampleHeight(lowest!.x, lowest!.z));
  });

  it("probes the ground the rock is actually drawn over: its own variant, stretch and radii", () => {
    // The variation hashes position, rotation and scale (not Y), so the radius probed
    // at the final spot is the radius Rocks.tsx draws there.
    const field = tilted(0.6, 0.2);
    for (let i = 0; i < 30; i++) {
      const rock = request(0.8 + (i % 9) * 0.1, "ROCK", i * 0.7);
      const spot = placeRock(field, { x: 0.2, z: 0.1 }, ORIGIN, rock);
      expect(spot).not.toBeNull();
      const v = drawnAt(spot!, rock);
      expect(rockDrawnRadius(v)).toBeLessThanOrEqual(ROCK_MAX_EXTENT + 1e-9);
    }
  });

  it("keeps every drawn rim point of the largest slabs over probed land on a coastal cell", () => {
    // Land runs 0.95 units from the cell centre in +x (a hex has inradius 0.87), water beyond.
    const field = coast(0.95);
    let slabs = 0;
    for (let i = 0; i < 40; i++) {
      // The generator puts a ROCK-cell rock up to 0.25 off centre, towards the coast here.
      const rock = request(1.6, "ROCK", (i * 2.39996) % (Math.PI * 2));
      const spot = placeRock(field, { x: 0.25, z: -0.2 + (i % 5) * 0.1 }, ORIGIN, rock);
      expect(spot).not.toBeNull();
      const v = drawnAt(spot!, rock);
      if (v.variant === 1) slabs++;
      const radius = rockDrawnRadius(v);
      for (let k = 0; k < 36; k++) {
        const theta = (k / 36) * Math.PI * 2;
        const ground = field.sampleHeight(spot!.x + Math.cos(theta) * radius, spot!.z + Math.sin(theta) * radius);
        expect(ground).toBeGreaterThan(MIN_GROUND_HEIGHT);
        // Over flat land the rim sits on the ground, not in the air.
        expect(drawnHeights(spot!, v).rim).toBeLessThanOrEqual(ground);
      }
    }
    expect(slabs).toBeGreaterThan(3);
  });

  it("drops a rock that cannot fit on the land rather than letting its rim overhang the water", () => {
    // The smallest large rock at scale 1.6 reaches 0.22 × 1.6 × 2.2 × 0.75 × 0.85 ≈ 0.49 units.
    const field = coast(0.45);
    for (let i = 0; i < 40; i++) {
      expect(placeRock(field, { x: 0.25, z: 0 }, ORIGIN, request(1.6, "ROCK", i * 0.37))).toBeNull();
    }
  });

  it("fits a smaller rock where the requested one would overhang: each nudge candidate re-hashes the variation", () => {
    const field = coast(0.75);
    const requested = { x: 0.25, z: 0 };
    let rescued = 0;
    for (let i = 0; i < 40; i++) {
      const rock = request(1.6, "ROCK", i * 0.37);
      const asRequested = rockDrawnRadius(drawnAt({ ...requested, y: 0 }, rock));
      const spot = placeRock(field, requested, ORIGIN, rock);
      if (!spot) continue;
      const radius = rockDrawnRadius(drawnAt(spot, rock));
      expect(spot.x + radius).toBeLessThan(0.75);
      expect(field.sampleHeight(spot.x + radius, spot.z)).toBeGreaterThan(MIN_GROUND_HEIGHT);
      if (requested.x + asRequested >= 0.75) rescued++;
    }
    expect(rescued).toBeGreaterThan(5);
  });

  it("stands on the centre on a slope, leaving the downhill side to the buried base", () => {
    const spot = placeRock(tilted(0.6, 0.5), ORIGIN, ORIGIN, request(1, "GRASS"));
    expect(spot!.y).toBeCloseTo(0.6 - ROCK_SINK);
  });

  it("lets stones sink by their own amount", () => {
    const spot = placeRock(tilted(0.6, 0.5), ORIGIN, ORIGIN, { ...request(0.8, "SAND"), sink: 0.01 });
    expect(spot!.y).toBeCloseTo(0.6 - 0.01);
  });

  it("probes a stone at the small radius it is drawn at, not its biome's size class", () => {
    // Rocks.tsx draws every stone "small". A grass stone probed at the biome's
    // medium class (×1.5) overhung the probe but not the screen, and was nudged
    // back from a coast or cliff edge it fitted on.
    const requested = { x: 0.4, z: 0 };
    for (let i = 0; i < 20; i++) {
      const stone: RockRequest = { ...request(1, "GRASS", i * 0.37), sizeClass: "small", sink: 0.01 };
      const drawn = rockDrawnRadius(drawnAt({ ...requested, y: 0 }, stone));
      const asMedium = rockDrawnRadius(drawnAt({ ...requested, y: 0 }, { ...stone, sizeClass: "medium" }));
      // Land ends just past the drawn rim: the stone fits as drawn, not as a medium rock.
      const coastX = requested.x + drawn + 0.02;
      expect(requested.x + asMedium).toBeGreaterThan(coastX);
      const spot = placeRock(coast(coastX), requested, ORIGIN, stone);
      expect(spot).not.toBeNull();
      expect(spot!.x).toBeCloseTo(requested.x, 9);
      expect(spot!.z).toBeCloseTo(requested.z, 9);
    }
  });
});
