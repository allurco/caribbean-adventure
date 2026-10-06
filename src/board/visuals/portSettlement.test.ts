import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, terrainSeedFromCells } from "./terrainHeightField";
import { groundTopY, MIN_GROUND_HEIGHT, type GroundField } from "./groundPlacement";
import { PORT_MARKER_RADIUS } from "../useHexGrid";
import { BUILDING_FOOTING, BUILDING_MAX_BURY, BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT } from "./agedBuildingGeometry";
import { PIER_WIDTH } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import { QUAY_BACK, QUAY_COPING_THICKNESS, QUAY_SEA_FACE, QUAY_STEP_Z, QUAY_WIDTH } from "./quayGeometry";
import { placeQuay, type QuayPlacement } from "./quayPlacement";
import {
  buildingGroundY,
  pierRootReserve,
  portBuildings,
  settlementGround,
  standBuilding,
  PIER_MOUTH_RESERVE,
  PIER_ROOT_RESERVE,
  PORT_BUILDING_GAP,
  PORT_BUILDING_MAX_RADIUS,
  PORT_SQUARE_RADIUS,
  PORT_BUILDING_SCALE_RANGE,
  PORT_BUILDING_SLOT_ANGLES,
  PORT_BUILDING_TINT_SPREAD,
  PORT_BUILDING_YAW_JITTER,
  WATCHTOWER_SCALE_RANGE,
  type PortBuilding,
} from "./portSettlement";

/** Inradius of a flat-top hex of size 1: the nearest any edge comes to the centre. */
const HEX_INRADIUS = Math.sqrt(3) / 2;
const maxReach = Math.max(...Object.values(AGED_BUILDING_HALF_DIAGONAL)) * PORT_BUILDING_SCALE_RANGE[1];

const cells = generateMap(getMapPreset("small"), 11);
const seed = terrainSeedFromCells(cells);
const field = createTerrainHeightField(cells, seed);
const buildings = portBuildings(cells, field, seed);
const ports = cells.filter((c) => c.hasPort);

const flat = (height: number): GroundField => ({ sampleHeight: () => height });

/** The port cell a building belongs to: the nearest port centre. */
function portOf(b: PortBuilding): MapCell {
  let best = ports[0];
  let bestD = Infinity;
  for (const p of ports) {
    const [x, , z] = hexToWorld(p.hex);
    const d = Math.hypot(x - b.worldX, z - b.worldZ);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const pierRotation = (cell: MapCell) => (cell.decorations ?? []).find((d) => d.type === "pier")?.rotation ?? 0;
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The centre and eight rim points of a plan circle, as the settlement probes a footprint. */
function footprintPoints(x: number, z: number, reach: number): { x: number; z: number }[] {
  const points = [{ x, z }];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    points.push({ x: x + Math.cos(a) * reach, z: z + Math.sin(a) * reach });
  }
  return points;
}

/** A synthetic port with a pier, as `quayPlacement.test.ts` builds one. */
const quayPort: MapCell = {
  hex: { q: 2, r: -1, s: -1 },
  terrain: "island",
  hasPort: true,
  elevation: 1,
  decorations: [{ type: "pier", position: [0, 0, 0], rotation: 0.7 }],
};
const quaySeed = 0x1234abcd;

/** World (x, z) of a point given in a quay's local frame (unscaled). */
function quayPoint(q: QuayPlacement, x: number, z: number): { x: number; z: number } {
  const lx = x * q.scaleX;
  const lz = z * q.scaleZ;
  return { x: q.worldX + lx * Math.cos(q.yaw) + lz * Math.sin(q.yaw), z: q.worldZ - lx * Math.sin(q.yaw) + lz * Math.cos(q.yaw) };
}

describe("settlementGround", () => {
  const sand = flat(0.05);
  const quay = placeQuay(quayPort, sand, quaySeed)!;
  const ground = settlementGround(quayPort, sand, quaySeed);

  it("is the quay's flat top on the deck, the step's top on the rear step and the terrain off the quay", () => {
    expect(ground.quay).toEqual(quay);
    const onDeck = quayPoint(quay, 0.05, (QUAY_STEP_Z + QUAY_SEA_FACE) / 2);
    expect(quay.top).toBeGreaterThan(0.05 + 0.03);
    expect(ground.sampleHeight(onDeck.x, onDeck.z)).toBeCloseTo(quay.top, 9);
    expect(ground.onQuay(onDeck.x, onDeck.z)).toBe(true);
    const onStep = quayPoint(quay, -0.05, (QUAY_BACK + QUAY_STEP_Z) / 2);
    expect(ground.sampleHeight(onStep.x, onStep.z)).toBeCloseTo(quay.top - QUAY_COPING_THICKNESS, 9);
    expect(ground.onQuay(onStep.x, onStep.z)).toBe(true);
    for (const off of [quayPoint(quay, QUAY_WIDTH / 2 + 0.05, 0), quayPoint(quay, 0, QUAY_BACK - 0.05), quayPoint(quay, 0, QUAY_SEA_FACE + 0.05)]) {
      expect(ground.sampleHeight(off.x, off.z)).toBe(0.05);
      expect(ground.onQuay(off.x, off.z)).toBe(false);
    }
  });

  it("is the terrain everywhere, with no quay, for a port without a pier", () => {
    const noPier = settlementGround({ ...quayPort, decorations: [] }, sand, quaySeed);
    expect(noPier.quay).toBeNull();
    const onDeck = quayPoint(quay, 0.05, (QUAY_STEP_Z + QUAY_SEA_FACE) / 2);
    expect(noPier.sampleHeight(onDeck.x, onDeck.z)).toBe(0.05);
    expect(noPier.onQuay(onDeck.x, onDeck.z)).toBe(false);
  });

  it("lets the sand win where it drifts over the quay's back: the visible surface, not a buried deck", () => {
    // Higher beach behind the step only; the sea-face probes that set the lift are untouched, so the quay is placed the same.
    const drifted: GroundField = {
      sampleHeight: (x, z) => {
        const dx = x - quay.worldX;
        const dz = z - quay.worldZ;
        const localZ = (dx * Math.sin(quay.yaw) + dz * Math.cos(quay.yaw)) / quay.scaleZ;
        return localZ < QUAY_STEP_Z ? 0.2 : 0.05;
      },
    };
    const buried = settlementGround(quayPort, drifted, quaySeed);
    expect(buried.quay).toEqual(quay);
    const onStep = quayPoint(quay, 0, (QUAY_BACK + QUAY_STEP_Z) / 2);
    expect(buried.sampleHeight(onStep.x, onStep.z)).toBe(0.2);
    const onDeck = quayPoint(quay, 0, (QUAY_STEP_Z + QUAY_SEA_FACE) / 2);
    expect(buried.sampleHeight(onDeck.x, onDeck.z)).toBeCloseTo(quay.top, 9);
  });
});

describe("standBuilding", () => {
  const sand = flat(0.05);
  const ground = settlementGround(quayPort, sand, quaySeed);
  const quay = ground.quay!;
  const [hx, , hz] = hexToWorld(quayPort.hex);
  const pierRoot = pierOrigin(sand, { x: hx, z: hz }, 0.7);
  const reach = 0.04;

  it("keeps the pier's land end clear: the deck's width round the root on the sand, the pier's mouth on the quay", () => {
    expect(PIER_MOUTH_RESERVE).toBeCloseTo(PIER_WIDTH / 2, 9);
    expect(pierRootReserve(false)).toBe(PIER_ROOT_RESERVE);
    expect(pierRootReserve(true)).toBe(PIER_MOUTH_RESERVE);
    expect(PIER_MOUTH_RESERVE).toBeLessThan(PIER_ROOT_RESERVE);
  });

  it("stands a footprint on the deck on the deck's top, not the sand under it, and nearer the pier root than the sand's reserve allows", () => {
    const at = quayPoint(quay, 0.08, -0.15);
    const d = Math.hypot(at.x - pierRoot.x, at.z - pierRoot.z);
    expect(d).toBeLessThan(PIER_ROOT_RESERVE + reach);
    expect(d).toBeGreaterThanOrEqual(PIER_MOUTH_RESERVE + reach);
    const spot = standBuilding(ground, at, reach, pierRoot, []);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBe(at.x);
    expect(spot!.z).toBe(at.z);
    expect(spot!.y).toBeCloseTo(buildingGroundY(quay.top), 9);
    expect(spot!.y).toBeGreaterThan(buildingGroundY(0.05));
  });

  it("never covers the pier's mouth: a footprint on the deck within the mouth reserve of the root is refused", () => {
    const at = quayPoint(quay, 0, -0.08);
    expect(Math.hypot(at.x - pierRoot.x, at.z - pierRoot.z)).toBeLessThan(PIER_MOUTH_RESERVE + reach);
    expect(standBuilding(ground, at, reach, pierRoot, [])).toBeNull();
  });

  it("refuses a footprint straddling the quay's edge, which the same sand without a quay takes", () => {
    const at = quayPoint(quay, QUAY_WIDTH / 2, -0.2);
    const probes = footprintPoints(at.x, at.z, reach).map((p) => ground.onQuay(p.x, p.z));
    expect(probes).toContain(true);
    expect(probes).toContain(false);
    expect(standBuilding(ground, at, reach, pierRoot, [])).toBeNull();
    const noQuay = settlementGround({ ...quayPort, decorations: [] }, sand, quaySeed);
    const spot = standBuilding(noQuay, at, reach, pierRoot, []);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeCloseTo(buildingGroundY(0.05), 9);
  });
});

describe("portBuildings", () => {
  it("names its layout constants: four slots on the landward arc, small scale and tint spreads", () => {
    expect(PORT_BUILDING_SLOT_ANGLES).toHaveLength(4);
    for (const a of PORT_BUILDING_SLOT_ANGLES) expect(Math.abs(a)).toBeLessThan(Math.PI / 2);
    // The reserve at the pier's land end is at least half the deck's width, so the deck's root stays clear.
    expect(PIER_ROOT_RESERVE).toBeGreaterThanOrEqual(PIER_WIDTH / 2);
    // The widest building at the farthest slot still lies inside the hex.
    expect(PORT_BUILDING_MAX_RADIUS + maxReach).toBeLessThan(HEX_INRADIUS);
    // The open square at the centre is small: well inside the old 0.35 marker footprint.
    expect(PORT_SQUARE_RADIUS).toBeGreaterThan(0);
    expect(PORT_SQUARE_RADIUS).toBeLessThan(PORT_MARKER_RADIUS);
    expect(PORT_BUILDING_SCALE_RANGE[0]).toBeGreaterThanOrEqual(0.9);
    expect(PORT_BUILDING_SCALE_RANGE[1]).toBeLessThanOrEqual(1.1);
    expect(PORT_BUILDING_TINT_SPREAD).toBeLessThanOrEqual(0.1);
    expect(PORT_BUILDING_YAW_JITTER).toBeLessThanOrEqual(0.2);
    // The watchtower never breaks the height cap at its largest scale.
    expect(AGED_BUILDING_HEIGHT.watchtower * WATCHTOWER_SCALE_RANGE[1]).toBeLessThanOrEqual(BUILDING_MAX_HEIGHT);
  });

  it("is deterministic", () => {
    expect(portBuildings(cells, field, seed)).toEqual(buildings);
  });

  it("hashes the whole 32-bit seed: a seed differing only in a high bit gives a different layout", () => {
    for (const bit of [20, 25, 30, 31]) {
      const other = portBuildings(cells, field, seed ^ (1 << bit));
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((b) => b.tint)).not.toEqual(buildings.map((b) => b.tint));
    }
  });

  it("gives every port a watchtower and up to three other buildings, four to five instances at most", () => {
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const mine = buildings.filter((b) => portOf(b) === port);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      expect(mine.length).toBeLessThanOrEqual(5);
      expect(mine.filter((b) => b.kind === "watchtower")).toHaveLength(1);
      // The other kinds appear at most once each.
      const kinds = mine.map((b) => b.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
    // Most slots are filled; a cramped beach with water on three sides drops a building or two.
    expect(buildings.length).toBeGreaterThanOrEqual(ports.length * 2.5);
  });

  it("puts no building on a cell without a port, but a watchtower on every port, fort decoration or not", () => {
    const noForts = cells.map((c) =>
      c.hasPort ? { ...c, decorations: (c.decorations ?? []).filter((d) => d.type !== "fort") } : c
    );
    const towers = portBuildings(noForts, field, seed).filter((b) => b.kind === "watchtower");
    expect(towers).toHaveLength(ports.length);
    const noPorts = cells.map((c) => ({ ...c, hasPort: false }));
    expect(portBuildings(noPorts, flat(0.3), seed)).toEqual([]);
  });

  it("flies the port's nation on the watchtower and on nothing else", () => {
    for (const b of buildings) {
      if (b.kind === "watchtower") expect(b.nation).toBe(portOf(b).nation);
      else expect(b.nation).toBeUndefined();
    }
    expect(new Set(buildings.filter((b) => b.kind === "watchtower").map((b) => b.nation)).size).toBeGreaterThan(1);
  });

  it("stands the tower at an end of the crescent, the slot nearest the water on the fort's side, so it reads against the sea", () => {
    const onFlat = portBuildings(cells, flat(0.3), seed);
    const endSlots = [PORT_BUILDING_SLOT_ANGLES[0], PORT_BUILDING_SLOT_ANGLES[PORT_BUILDING_SLOT_ANGLES.length - 1]];
    for (const b of onFlat) {
      if (b.kind !== "watchtower") continue;
      const port = portOf(b);
      const [px, , pz] = hexToWorld(port.hex);
      const landward = pierRotation(port) + Math.PI;
      const direction = Math.atan2(b.worldX - px, b.worldZ - pz);
      const offLandward = Math.atan2(Math.sin(direction - landward), Math.cos(direction - landward));
      // On flat ground the tower takes its slot exactly (the first candidate), give or take a candidate step.
      expect(Math.min(...endSlots.map((a) => Math.abs(offLandward - a)))).toBeLessThan(Math.PI / 15 + 1e-9);
      const fort = (port.decorations ?? []).find((d) => d.type === "fort");
      if (fort) {
        const fortDirection = Math.atan2(fort.position[0], fort.position[2]);
        const other = endSlots.find((a) => Math.abs(offLandward - a) > 1)!;
        expect(angleDiff(direction, fortDirection)).toBeLessThanOrEqual(angleDiff(landward + other, fortDirection) + 1e-9);
      }
    }
    // On the real map no tower falls back to the hex centre.
    for (const b of buildings) {
      if (b.kind !== "watchtower") continue;
      const [px, , pz] = hexToWorld(portOf(b).hex);
      expect(Math.hypot(b.worldX - px, b.worldZ - pz)).toBeGreaterThan(PORT_SQUARE_RADIUS);
    }
  });

  it("never drops the tower: on a beach too small for any footprint it stands at the hex centre on the highest ground there", () => {
    const centres = ports.map((p) => hexToWorld(p.hex));
    const islet: GroundField = {
      sampleHeight: (x, z) => (centres.some(([cx, , cz]) => Math.hypot(x - cx, z - cz) < 0.1) ? 0.3 : -1),
    };
    const onIslets = portBuildings(cells, islet, seed);
    expect(onIslets.filter((b) => b.kind === "watchtower")).toHaveLength(ports.length);
    expect(onIslets.filter((b) => b.kind !== "watchtower")).toHaveLength(0);
    for (const b of onIslets) {
      const [px, , pz] = hexToWorld(portOf(b).hex);
      expect(Math.hypot(b.worldX - px, b.worldZ - pz)).toBeLessThan(1e-9);
      expect(b.worldY).toBeCloseTo(groundTopY(islet, px, pz, AGED_BUILDING_HALF_DIAGONAL.watchtower * b.scale), 9);
    }
  });

  it("keeps every building inside the hex, off its neighbours and clear of the pier's land end", () => {
    for (const b of buildings) {
      const port = portOf(b);
      const [px, , pz] = hexToWorld(port.hex);
      const d = Math.hypot(b.worldX - px, b.worldZ - pz);
      const reach = AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
      expect(d).toBeLessThanOrEqual(PORT_BUILDING_MAX_RADIUS + 1e-9);
      expect(d + reach).toBeLessThan(HEX_INRADIUS);
      // The buildings ring an open square at the centre; no footprint intrudes on it.
      expect(d - reach).toBeGreaterThanOrEqual(PORT_SQUARE_RADIUS - 1e-9);
      // The quay stands where the pier meets the beach; no building covers the pier's land end,
      // from the sand by the deck's width, from the quay by the pier's mouth.
      const root = pierOrigin(field, { x: px, z: pz }, pierRotation(port));
      const ground = settlementGround(port, field, seed);
      const reserve = pierRootReserve(ground.onQuay(b.worldX, b.worldZ));
      expect(Math.hypot(b.worldX - root.x, b.worldZ - root.z) - reach).toBeGreaterThanOrEqual(reserve - 1e-9);
      for (const other of buildings) {
        if (other === b) continue;
        const gap = Math.hypot(other.worldX - b.worldX, other.worldZ - b.worldZ) - reach - AGED_BUILDING_HALF_DIAGONAL[other.kind] * other.scale;
        expect(gap).toBeGreaterThanOrEqual(PORT_BUILDING_GAP - 1e-9);
      }
    }
  });

  it("uses the whole hex now the marker is an invisible hover volume: buildings stand over its footprint", () => {
    // The marker used to hold every corner 0.39 from the centre; the crescent now closes in on the square.
    const nearest = ports.map((port) => {
      const [px, , pz] = hexToWorld(port.hex);
      return Math.min(
        ...buildings.filter((b) => portOf(b) === port).map((b) => Math.hypot(b.worldX - px, b.worldZ - pz) - AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale)
      );
    });
    const overFootprint = nearest.filter((d) => d < PORT_MARKER_RADIUS).length;
    expect(overFootprint).toBeGreaterThanOrEqual(Math.ceil(ports.length * 0.75));
    const mean = buildings.reduce((sum, b) => {
      const [px, , pz] = hexToWorld(portOf(b).hex);
      return sum + Math.hypot(b.worldX - px, b.worldZ - pz);
    }, 0) / buildings.length;
    expect(mean).toBeLessThan(0.45);
  });

  it("stands every building on the ground it sees, on land: the sand, or the quay's deck where it stands on the quay", () => {
    for (const b of buildings) {
      const settlement = settlementGround(portOf(b), field, seed);
      const ground = settlement.sampleHeight(b.worldX, b.worldZ);
      expect(ground).toBeGreaterThan(MIN_GROUND_HEIGHT);
      // Everywhere under the footprint the ground lies between the bottom of the
      // footing (so no wall floats) and the deepest allowed bury on the high side.
      const reach = AGED_BUILDING_HALF_DIAGONAL[b.kind] * b.scale;
      const probes = footprintPoints(b.worldX, b.worldZ, reach);
      const heights = probes.map((p) => settlement.sampleHeight(p.x, p.z));
      // Wholly on the quay or wholly off it: a wall never steps down the quay's edge.
      const onQuay = probes.filter((p) => settlement.onQuay(p.x, p.z)).length;
      expect([0, probes.length]).toContain(onQuay);
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(b.worldY - BUILDING_FOOTING - 1e-9);
        expect(h).toBeLessThanOrEqual(b.worldY + BUILDING_MAX_BURY + 1e-9);
      }
      // And it does rest on the ground: the lowest probe is within the footing of the origin.
      expect(b.worldY - Math.min(...heights)).toBeLessThanOrEqual(BUILDING_FOOTING);
    }
  });

  it("keeps every roof under the port label's baseline", () => {
    for (const b of buildings) {
      const [px, , pz] = hexToWorld(portOf(b).hex);
      const labelBase = groundTopY(field, px, pz, PORT_MARKER_RADIUS) + 0.6;
      expect(b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale).toBeLessThan(labelBase);
      expect(AGED_BUILDING_HEIGHT[b.kind] * b.scale).toBeLessThanOrEqual(BUILDING_MAX_HEIGHT);
    }
  });

  it("places the buildings behind the pier, on the landward half, facing the water", () => {
    for (const b of buildings) {
      const port = portOf(b);
      const [px, , pz] = hexToWorld(port.hex);
      const toWater = pierRotation(port);
      const toBuilding = Math.atan2(b.worldX - px, b.worldZ - pz);
      // More than a right angle away from the docking direction.
      expect(angleDiff(toBuilding, toWater)).toBeGreaterThan(Math.PI / 2);
      expect(angleDiff(b.yaw, toWater)).toBeLessThanOrEqual(PORT_BUILDING_YAW_JITTER + 1e-9);
    }
  });

  it("varies scale and tint within their spreads", () => {
    for (const b of buildings) {
      const range = b.kind === "watchtower" ? WATCHTOWER_SCALE_RANGE : PORT_BUILDING_SCALE_RANGE;
      expect(b.scale).toBeGreaterThanOrEqual(range[0]);
      expect(b.scale).toBeLessThanOrEqual(range[1]);
      expect(Math.abs(b.tint - 1)).toBeLessThanOrEqual(PORT_BUILDING_TINT_SPREAD);
    }
    expect(new Set(buildings.map((b) => b.tint.toFixed(4))).size).toBeGreaterThan(buildings.length / 2);
  });
});
