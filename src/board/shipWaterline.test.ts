/**
 * Where a ship's hull meets the water (#150): Ship.tsx's stack of groups,
 * rebuilt here from the same constants. The ship's group stands on the sea
 * at its waterline (SHIP_WATERLINE_Y), the wave-pose group inside it heaves,
 * pitches and rolls about that point (#142), and the body sits in that: the
 * model with its origin, the generator's waterline, on the group; the box
 * with its centre at the ride height.
 */
import { describe, expect, it } from "vitest";
import { Group, Vector3 } from "three";
import { SHIP_CLASSES } from "../game/types";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";
import { type ShipModel, shipModel, shipModelDraftUnits, shipModelPlacement } from "./shipModels";
import { SHIP_RIDE_HEIGHT, SHIP_WATERLINE_Y, shipHullBox } from "./shipHull";
import { ZERO_WAVE_POSE, shipWavePose, wavePoseRotation, type WavePose } from "./shipWavePose";
import { createSeaSurface } from "./visuals/seaSurface";
import { WAVE_CASCADES } from "./visuals/oceanWaves";

interface Body {
  y: number;
  rotationY: number;
  scale: number;
}

interface Placed {
  x: number;
  seaLevel: number;
  z: number;
  heading: number;
}

/** The body group of a ship drawn at `at` in wave pose `pose`, its world matrices up to date. */
function stack(body: Body, at: Placed, pose: WavePose): Group {
  const ship = new Group();
  ship.position.set(at.x, at.seaLevel + SHIP_WATERLINE_Y, at.z);
  ship.rotation.y = at.heading;
  const inner = new Group();
  inner.position.y = pose.heave;
  inner.rotation.set(...wavePoseRotation(pose));
  const drawn = new Group();
  drawn.position.y = body.y;
  drawn.rotation.y = body.rotationY;
  drawn.scale.setScalar(body.scale);
  ship.add(inner);
  inner.add(drawn);
  ship.updateMatrixWorld(true);
  return drawn;
}

const modelBody = (): Body => {
  const { y, rotationY, scale } = shipModelPlacement();
  return { y, rotationY, scale };
};

/** Where a point of the model, in its own metres, is drawn. */
const drawnAt = (body: Group, x: number, y: number, z: number) => body.localToWorld(new Vector3(x, y, z));

const MODELLED = SHIP_CLASSES.flatMap((shipClass) => {
  const model = shipModel(shipClass);
  return model ? [[shipClass, model] as const] : [];
});

describe("a ship's waterline on the sea (#150)", () => {
  it("has a model with a draft for every class", () => {
    expect(MODELLED.map(([shipClass]) => shipClass)).toEqual([...SHIP_CLASSES]);
  });

  for (const [shipClass, model] of MODELLED) {
    it(`sets the ${shipClass}'s waterline on the sea at rest, its keel its draft under it`, () => {
      const at: Placed = { x: 3, seaLevel: 0, z: -2, heading: 0.9 };
      const body = stack(modelBody(), at, ZERO_WAVE_POSE);
      expect(drawnAt(body, 0, 0, 0).y).toBeCloseTo(at.seaLevel, 10);
      // The draft at ship scale: the model's metres, at 65 m a unit, times SHIP_SCALE.
      const draft = metresToUnits(model.draftMetres) * SHIP_SCALE;
      expect(shipModelDraftUnits(model)).toBeCloseTo(draft, 12);
      expect(drawnAt(body, 0, -model.draftMetres, 0).y).toBeCloseTo(at.seaLevel - draft, 10);
    });
  }

  it("keeps the model's waterline on the heave point while the ship pitches and rolls", () => {
    const at: Placed = { x: 3, seaLevel: 0, z: 4, heading: 0.7 };
    const pose: WavePose = { heave: 0.01, pitch: 0.08, roll: -0.05 };
    const origin = drawnAt(stack(modelBody(), at, pose), 0, 0, 0);
    // The pose turns the hull about its waterline, not about a point above it.
    expect(origin.x).toBeCloseTo(at.x, 10);
    expect(origin.y).toBeCloseTo(pose.heave, 10);
    expect(origin.z).toBeCloseTo(at.z, 10);
  });

  it("keeps a box's centre at the ride height above the sea at rest, as before", () => {
    const box = stack({ y: SHIP_RIDE_HEIGHT, rotationY: 0, scale: 1 }, { x: 0, seaLevel: 0, z: 0, heading: 0.4 }, ZERO_WAVE_POSE);
    expect(drawnAt(box, 0, 0, 0).y).toBeCloseTo(SHIP_RIDE_HEIGHT, 12);
  });
});

describe("a modelled hull riding the swell (#150)", () => {
  // Open sea, the camera close by: full displacement, no distance fade.
  const OPEN_SEA = () => -10;
  const swell = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true, cascade: WAVE_CASCADES[0] });
  const chop = createSeaSurface({ seabedHeightAt: OPEN_SEA, enabled: true, cascade: WAVE_CASCADES[1] });
  const SPOTS: Placed[] = [
    { x: 0, seaLevel: 0, z: 0, heading: 0 },
    { x: 3.7, seaLevel: 0, z: 2.3, heading: 1.1 },
    { x: -5.1, seaLevel: 0, z: 7.9, heading: 2.6 },
    { x: 11.3, seaLevel: 0, z: -4.4, heading: -0.8 },
  ];
  const TIMES = Array.from({ length: 24 }, (_, i) => 3.1 + i * 2.3);

  /** Points along the keel half the draft down, over the middle two thirds of the hull: model metres. */
  const lowerHull = (model: ShipModel): [number, number, number][] =>
    [-1 / 3, -1 / 6, 0, 1 / 6, 1 / 3].map((f) => [0, -model.draftMetres / 2, f * model.lengthMetres]);

  for (const [shipClass, model] of MODELLED) {
    it(`keeps the ${shipClass}'s lower hull under the drawn sea (swell and chop) as it heaves, pitches and rolls`, () => {
      const hull = shipHullBox(shipClass);
      let highest = -Infinity;
      // Time outside, spots inside: the sea's FFT grids are kept for the moment
      // last asked, so each moment's are built once, not once per spot (#335).
      for (const t of TIMES) {
        for (const at of SPOTS) {
          const eye = [at.x, 0.1, at.z] as const;
          const swellAt = (x: number, z: number) => swell.heightAt(x, z, t, eye);
          const seaAt = (x: number, z: number) => swellAt(x, z) + chop.heightAt(x, z, t, eye);
          // The ship rides the swell (useShipWavePose); the GPU draws swell and chop.
          const pose = shipWavePose(swellAt, hull, at.x, at.z, at.heading);
          const body = stack(modelBody(), at, pose);
          for (const [x, y, z] of lowerHull(model)) {
            const p = drawnAt(body, x, y, z);
            highest = Math.max(highest, p.y - seaAt(p.x, p.z));
          }
        }
      }
      expect(highest).toBeLessThan(0);
    });
  }
});
