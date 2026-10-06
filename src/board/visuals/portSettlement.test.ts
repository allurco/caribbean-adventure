import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { hexToWorld } from "../../game/hex";
import type { MapCell } from "../../game/types";
import { createTerrainHeightField, SEA_LEVEL, terrainSeedFromCells } from "./terrainHeightField";
import { groundTopY, MIN_GROUND_HEIGHT, type GroundField } from "./groundPlacement";
import { landSurface, landSurfaceHeight } from "./landMesh";
import { PORT_GROUND_PROBE_RADIUS as PORT_MARKER_RADIUS } from "./portHover";
import { BUILDING_FOOTING, BUILDING_KINDS, BUILDING_MAX_HEIGHT } from "./buildingGeometry";
import { AGED_BUILDING_HALF_DIAGONAL, AGED_BUILDING_HEIGHT, AGED_BUILDING_PLAN } from "./agedBuildingGeometry";
import { PIER_WIDTH } from "./pierGeometry";
import { pierOrigin } from "./pierPlacement";
import { QUAY_BACK, QUAY_COPING_THICKNESS, QUAY_SEA_FACE, QUAY_STEP_Z, QUAY_WIDTH } from "./quayGeometry";
import { placeQuay, type QuayPlacement } from "./quayPlacement";
import {
  buildingGroundY,
  buildingMaxSpread,
  CHURCH_SCALE_RANGE,
  PORT_CHURCH_SLOT_INDEX,
  pierRootReserve,
  planFootprint,
  planProbePoints,
  portBuildings,
  scaleRangeOf,
  settlementGround,
  standBuilding,
  BUILDING_FOOTING_MARGIN,
  BUILDING_SINK,
  PIER_MOUTH_RESERVE,
  PIER_ROOT_RESERVE,
  PLAN_FOOTPRINT_MARGIN,
  PORT_BUILDING_GAP,
  PORT_BUILDING_MAX_RADIUS,
  PORT_SETTLEMENT_RADIUS,
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
const maxReach = Math.max(...BUILDING_KINDS.map((kind) => AGED_BUILDING_HALF_DIAGONAL[kind] * scaleRangeOf(kind)[1]));

const cells = generateMap(getMapPreset("small"), 11);
const seed = terrainSeedFromCells(cells);
const field = createTerrainHeightField(cells, seed);
/** The ground as it is drawn (the land mesh's lattice surface), which the layout hands the settlement. */
const surface = landSurface(field);
const buildings = portBuildings(cells, surface, seed);
const ports = cells.filter((c) => c.hasPort);
/** Slack on "no ground above the contact" between the placement's probes, in world units (3 mm here, about 20 cm at 65 m/unit). */
const OVER_TERRAIN_SLACK = 0.003;

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

/** The centre and rings of a plan circle: `rim` points on the rim, half as many at half reach, a quarter at a quarter. */
function footprintPoints(x: number, z: number, reach: number, rim = 16): { x: number; z: number }[] {
  const points = [{ x, z }];
  for (const [n, r] of [
    [rim, reach],
    [rim / 2, reach / 2],
    [rim / 4, reach / 4],
  ]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      points.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
    }
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
    const spot = standBuilding(ground, at, reach, BUILDING_FOOTING, pierRoot, []);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBe(at.x);
    expect(spot!.z).toBe(at.z);
    expect(spot!.y).toBeCloseTo(buildingGroundY(quay.top), 9);
    expect(spot!.y).toBeGreaterThan(buildingGroundY(0.05));
  });

  it("never covers the pier's mouth: a footprint on the deck within the mouth reserve of the root is refused", () => {
    const at = quayPoint(quay, 0, -0.08);
    expect(Math.hypot(at.x - pierRoot.x, at.z - pierRoot.z)).toBeLessThan(PIER_MOUTH_RESERVE + reach);
    expect(standBuilding(ground, at, reach, BUILDING_FOOTING, pierRoot, [])).toBeNull();
  });

  it("refuses a footprint straddling the quay's edge, which the same sand without a quay takes", () => {
    const at = quayPoint(quay, QUAY_WIDTH / 2, -0.2);
    const probes = footprintPoints(at.x, at.z, reach).map((p) => ground.onQuay(p.x, p.z));
    expect(probes).toContain(true);
    expect(probes).toContain(false);
    expect(standBuilding(ground, at, reach, BUILDING_FOOTING, pierRoot, [])).toBeNull();
    const noQuay = settlementGround({ ...quayPort, decorations: [] }, sand, quaySeed);
    const spot = standBuilding(noQuay, at, reach, BUILDING_FOOTING, pierRoot, []);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBeCloseTo(buildingGroundY(0.05), 9);
  });
});

describe("portBuildings", () => {
  it("names its layout constants: five slots on the landward arc, the middle one straight landward for the church, small scale and tint spreads", () => {
    expect(PORT_BUILDING_SLOT_ANGLES).toHaveLength(5);
    for (const a of PORT_BUILDING_SLOT_ANGLES) expect(Math.abs(a)).toBeLessThan(Math.PI / 2);
    expect(PORT_BUILDING_SLOT_ANGLES[PORT_CHURCH_SLOT_INDEX]).toBe(0);
    // Symmetric about the landward ray, the ends unchanged.
    expect(PORT_BUILDING_SLOT_ANGLES.map((a) => 0 - a || 0).reverse()).toEqual([...PORT_BUILDING_SLOT_ANGLES]);
    expect(PORT_BUILDING_SLOT_ANGLES[0]).toBe(-1.3);
    // The reserve at the pier's land end is at least half the deck's width, so the deck's root stays clear.
    expect(PIER_ROOT_RESERVE).toBeGreaterThanOrEqual(PIER_WIDTH / 2);
    // The widest building at the farthest slot still lies inside the hex, and the settlement's
    // envelope (which the port's hover volume covers) is exactly that, counting the tower's own scale.
    expect(PORT_BUILDING_MAX_RADIUS + maxReach).toBeLessThan(HEX_INRADIUS);
    const towerReach = AGED_BUILDING_HALF_DIAGONAL.watchtower * WATCHTOWER_SCALE_RANGE[1];
    expect(PORT_SETTLEMENT_RADIUS).toBeCloseTo(PORT_BUILDING_MAX_RADIUS + Math.max(maxReach, towerReach), 12);
    expect(PORT_SETTLEMENT_RADIUS).toBeLessThan(HEX_INRADIUS);
    expect(PORT_SETTLEMENT_RADIUS).toBeGreaterThan(0.8);
    // The open square at the centre is small: well inside the old 0.35 marker footprint.
    expect(PORT_SQUARE_RADIUS).toBeGreaterThan(0);
    expect(PORT_SQUARE_RADIUS).toBeLessThan(PORT_MARKER_RADIUS);
    expect(PORT_BUILDING_SCALE_RANGE[0]).toBeGreaterThanOrEqual(0.9);
    expect(PORT_BUILDING_SCALE_RANGE[1]).toBeLessThanOrEqual(1.1);
    expect(PORT_BUILDING_TINT_SPREAD).toBeLessThanOrEqual(0.1);
    expect(PORT_BUILDING_YAW_JITTER).toBeLessThanOrEqual(0.2);
    // The watchtower never breaks the height cap at its largest scale.
    expect(AGED_BUILDING_HEIGHT.watchtower * WATCHTOWER_SCALE_RANGE[1]).toBeLessThanOrEqual(BUILDING_MAX_HEIGHT);
    expect(scaleRangeOf("watchtower")).toBe(WATCHTOWER_SCALE_RANGE);
    expect(scaleRangeOf("church")).toBe(CHURCH_SCALE_RANGE);
    expect(scaleRangeOf("house")).toBe(PORT_BUILDING_SCALE_RANGE);
  });

  it("keeps the church's top, at its largest scale, under the cap and clearly under the smallest tower's, so the tower stays the one landmark", () => {
    const churchTop = AGED_BUILDING_HEIGHT.church * CHURCH_SCALE_RANGE[1];
    expect(churchTop).toBeLessThan(BUILDING_MAX_HEIGHT);
    expect(churchTop).toBeLessThan(AGED_BUILDING_HEIGHT.watchtower * WATCHTOWER_SCALE_RANGE[0] - 0.02);
    expect(CHURCH_SCALE_RANGE[0]).toBeGreaterThanOrEqual(0.9);
    expect(CHURCH_SCALE_RANGE[1]).toBeLessThanOrEqual(PORT_BUILDING_SCALE_RANGE[1]);
  });

  it("stands on top of the ground: the contact a hair under the highest point, the footing covering the rest with a margin", () => {
    expect(BUILDING_SINK).toBeGreaterThan(0);
    expect(BUILDING_SINK).toBeLessThanOrEqual(0.003);
    expect(BUILDING_FOOTING_MARGIN).toBeGreaterThan(0);
    expect(BUILDING_FOOTING_MARGIN).toBeLessThanOrEqual(0.02);
    expect(buildingGroundY(0.3)).toBeCloseTo(0.3 - BUILDING_SINK, 12);
    // A footprint may span what the footing covers, less the sink and the margin: still most of a footing, so beaches stay buildable.
    expect(buildingMaxSpread(BUILDING_FOOTING)).toBeCloseTo(BUILDING_FOOTING - BUILDING_SINK - BUILDING_FOOTING_MARGIN, 12);
    expect(buildingMaxSpread(BUILDING_FOOTING * PORT_BUILDING_SCALE_RANGE[0])).toBeGreaterThan(0.09);
  });

  it("is deterministic", () => {
    expect(portBuildings(cells, surface, seed)).toEqual(buildings);
  });

  it("hashes the whole 32-bit seed: a seed differing only in a high bit gives a different layout", () => {
    for (const bit of [20, 25, 30, 31]) {
      const other = portBuildings(cells, field, seed ^ (1 << bit));
      expect(other.length).toBeGreaterThan(0);
      expect(other.map((b) => b.tint)).not.toEqual(buildings.map((b) => b.tint));
    }
  });

  it("gives every port a watchtower, a church where the ground takes one, and up to three other buildings, five at most", () => {
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      const mine = buildings.filter((b) => portOf(b) === port);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      expect(mine.length).toBeLessThanOrEqual(5);
      expect(mine.filter((b) => b.kind === "watchtower")).toHaveLength(1);
      expect(mine.filter((b) => b.kind === "church").length).toBeLessThanOrEqual(1);
      // The other kinds appear at most once each.
      const kinds = mine.map((b) => b.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
    // The tower, the church and one or two more: about three per port (2.97 to 3.08 over eight seeds of
    // each size) now the ground is probed under the walls rather than over the whole plan circle.
    expect(buildings.length).toBeGreaterThanOrEqual(ports.length * 2.6);
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

  it("fronts the church on the square from straight landward, placed second so it gets the ground after the tower", () => {
    const onFlat = portBuildings(cells, flat(0.3), seed);
    for (const port of ports) {
      const mine = onFlat.filter((b) => portOf(b) === port);
      expect(mine[0].kind).toBe("watchtower");
      expect(mine[1].kind).toBe("church");
      const [px, , pz] = hexToWorld(port.hex);
      const landward = pierRotation(port) + Math.PI;
      const direction = Math.atan2(mine[1].worldX - px, mine[1].worldZ - pz);
      // On flat ground the church takes the centre slot exactly: straight landward of the square.
      expect(angleDiff(direction, landward)).toBeLessThan(1e-6);
      // Its door faces the square and the water, like the others.
      expect(angleDiff(mine[1].yaw, pierRotation(port))).toBeLessThanOrEqual(PORT_BUILDING_YAW_JITTER + 1e-9);
      expect(mine[1].nation).toBeUndefined();
    }
  });

  it("gives nearly every port a church over seeded maps of every size, and keeps every top under the label", () => {
    let portsSeen = 0;
    let churches = 0;
    let slack = Infinity;
    let churchSlack = Infinity;
    for (const size of ["small", "medium", "large"] as const) {
      for (const mapSeed of [3, 11, 42]) {
        const someCells = generateMap(getMapPreset(size), mapSeed);
        const someSeed = terrainSeedFromCells(someCells);
        const someField = createTerrainHeightField(someCells, someSeed);
        const placed = portBuildings(someCells, someField, someSeed);
        const somePorts = someCells.filter((c) => c.hasPort);
        portsSeen += somePorts.length;
        for (const port of somePorts) {
          const [px, , pz] = hexToWorld(port.hex);
          const labelBase = groundTopY(someField, px, pz, PORT_MARKER_RADIUS) + 0.6;
          const mine = placed.filter((b) => Math.hypot(b.worldX - px, b.worldZ - pz) < 1);
          if (mine.some((b) => b.kind === "church")) churches++;
          for (const b of mine) {
            const s = labelBase - (b.worldY + AGED_BUILDING_HEIGHT[b.kind] * b.scale);
            slack = Math.min(slack, s);
            if (b.kind === "church") churchSlack = Math.min(churchSlack, s);
          }
        }
      }
    }
    expect(portsSeen).toBeGreaterThan(50);
    // A church is dropped only where no ground on the hex takes its walls' plan: 97–100 % of ports get
    // one over eight seeds of each size (60–68 % when the whole plan circle had to fit the footing's spread).
    expect(churches / portsSeen).toBeGreaterThanOrEqual(0.95);
    // Everything stays under the label; the tower sets the minimum (0.027 here, as before the church),
    // the church's cross never comes within 0.05 of it (0.077 at the closest, a church standing high on a slope).
    expect(slack).toBeGreaterThan(0);
    expect(churchSlack).toBeGreaterThan(0.05);
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
      // On the islet's highest ground (its top at the centre), never below the sea.
      expect(b.worldY).toBeCloseTo(buildingGroundY(Math.max(SEA_LEVEL, 0.3)), 9);
      expect(b.worldY).toBeLessThanOrEqual(groundTopY(islet, px, pz, AGED_BUILDING_HALF_DIAGONAL.watchtower * b.scale));
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
      // Every corner is under the port's hover volume.
      expect(d + reach).toBeLessThanOrEqual(PORT_SETTLEMENT_RADIUS + 1e-9);
      // The buildings ring an open square at the centre; no footprint intrudes on it.
      expect(d - reach).toBeGreaterThanOrEqual(PORT_SQUARE_RADIUS - 1e-9);
      // The quay stands where the pier meets the beach; no building covers the pier's land end,
      // from the sand by the deck's width, from the quay by the pier's mouth.
      const root = pierOrigin(surface, { x: px, z: pz }, pierRotation(port));
      const ground = settlementGround(port, surface, seed);
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

  it("stands every building on top of the drawn ground, on land: no ground above the contact, the footing under the lowest point", () => {
    let worstAbove = -Infinity;
    for (const b of buildings) {
      const settlement = settlementGround(portOf(b), surface, seed);
      expect(settlement.sampleHeight(b.worldX, b.worldZ)).toBeGreaterThan(MIN_GROUND_HEIGHT);
      const footing = BUILDING_FOOTING * b.scale;
      // The ground under the walls (their plan rectangle with the margin, at the building's yaw), probed far
      // denser than the placement does (25 × 37 against 9 × 13), on the surface as drawn.
      const probes = planProbePoints(b.worldX, b.worldZ, planFootprint(b.kind, b.scale, b.yaw), 25, 37);
      const heights = probes.map((p) => settlement.sampleHeight(p.x, p.z));
      // Wholly on the quay or wholly off it: a wall never steps down the quay's edge.
      const onQuay = probes.filter((p) => settlement.onQuay(p.x, p.z)).length;
      expect([0, probes.length]).toContain(onQuay);
      // Nothing under the footprint rises above the ground contact: the walls are never cut into.
      const highest = Math.max(...heights);
      worstAbove = Math.max(worstAbove, highest - b.worldY);
      expect(highest).toBeLessThanOrEqual(b.worldY + OVER_TERRAIN_SLACK);
      // The contact rests on the ground, not above it: the highest point is within the sink of the contact.
      expect(b.worldY - highest).toBeLessThanOrEqual(BUILDING_SINK + 1e-9);
      // And nothing floats: the footing's base is under the lowest ground, with the margin to spare.
      expect(b.worldY - footing).toBeLessThanOrEqual(Math.min(...heights) - BUILDING_FOOTING_MARGIN + OVER_TERRAIN_SLACK);
    }
    // The drawn surface against the field: the placement probes the same lattice surface, so the two never disagree by more than the slack.
    for (const b of buildings) expect(Math.abs(landSurfaceHeight(field, b.worldX, b.worldZ) - surface.sampleHeight(b.worldX, b.worldZ))).toBeLessThan(1e-9);
    expect(worstAbove).toBeLessThanOrEqual(OVER_TERRAIN_SLACK);
  });

  it("probes the ground under the walls' plan, not the plan circle: a long nave across a ramp stands where its circle would not", () => {
    const noQuay = { ...quayPort, decorations: [] };
    const [hx, , hz] = hexToWorld(quayPort.hex);
    const pierRoot = { x: hx + 5, z: hz + 5 };
    const scale = 1;
    const reach = AGED_BUILDING_HALF_DIAGONAL.church * scale;
    const footing = BUILDING_FOOTING * scale;
    // The plan with its margin stays inside the circle (its corners included: the creases probed are
    // those within the circle, and the circle is what keeps neighbours and the pier root clear), and
    // the margin is a fraction of the eave's overhang.
    for (const kind of BUILDING_KINDS) {
      const plan = planFootprint(kind, scale, 0);
      expect(Math.hypot(plan.halfW, plan.halfD)).toBeLessThanOrEqual(AGED_BUILDING_HALF_DIAGONAL[kind] * scale + 1e-9);
      expect(plan.halfW).toBeGreaterThan(AGED_BUILDING_PLAN[kind].halfW * scale);
      expect(plan.halfD).toBeGreaterThan(AGED_BUILDING_PLAN[kind].halfD * scale);
    }
    expect(PLAN_FOOTPRINT_MARGIN).toBeLessThanOrEqual(0.025);
    expect(planFootprint("church", scale, 0)).toEqual({ halfW: 0.1 + PLAN_FOOTPRINT_MARGIN, halfD: 0.15 + PLAN_FOOTPRINT_MARGIN, yaw: 0 });
    // The tower's square plan (0.1 half-base) under its 0.15 reach has no room for the full margin: its
    // corner with the margin would stand at 0.17. It takes the largest margin whose corner stays on the
    // circle, still past the plinth course (0.004 proud).
    const tower = planFootprint("watchtower", scale, 0);
    expect(tower.halfW).toBeCloseTo(tower.halfD, 12);
    expect(Math.hypot(tower.halfW, tower.halfD)).toBeCloseTo(AGED_BUILDING_HALF_DIAGONAL.watchtower * scale, 9);
    expect(tower.halfW - AGED_BUILDING_PLAN.watchtower.halfW).toBeGreaterThan(0.004);
    expect(tower.halfW - AGED_BUILDING_PLAN.watchtower.halfW).toBeLessThan(PLAN_FOOTPRINT_MARGIN);
    // The margin scales with the piece.
    expect(planFootprint("watchtower", 1.05, 0).halfW).toBeCloseTo(tower.halfW * 1.05, 12);
    // A ramp rising along x: the plan circle spans 0.46, the nave across the ramp (front to +z, yaw 0) only 0.24.
    const grade = 0.5;
    const ramp: GroundField = { sampleHeight: (x) => 0.1 + grade * (x - hx) };
    const ground = settlementGround(noQuay, ramp, 0);
    const circle = standBuilding(ground, { x: hx, z: hz }, reach, footing, pierRoot, []);
    expect(circle).toBeNull();
    const across = standBuilding(ground, { x: hx, z: hz }, reach, footing, pierRoot, [], planFootprint("church", scale, 0));
    expect(across).not.toBeNull();
    expect(across!.y).toBeCloseTo(buildingGroundY(0.1 + grade * (0.1 + PLAN_FOOTPRINT_MARGIN)), 9);
    // Turned a quarter, the nave runs up the ramp and spans 0.34: too much for the footing.
    expect(0.34 * grade).toBeGreaterThan(buildingMaxSpread(footing));
    expect(standBuilding(ground, { x: hx, z: hz }, reach, footing, pierRoot, [], planFootprint("church", scale, Math.PI / 2))).toBeNull();
    // The grid covers the rectangle's corners and edges, turned with the plan.
    const pts = planProbePoints(hx, hz, { halfW: 0.1, halfD: 0.2, yaw: Math.PI / 2 }, 3, 3);
    expect(pts).toHaveLength(9);
    expect(Math.max(...pts.map((p) => Math.abs(p.x - hx)))).toBeCloseTo(0.2, 9);
    expect(Math.max(...pts.map((p) => Math.abs(p.z - hz)))).toBeCloseTo(0.1, 9);
  });

  it("stands a sloped footprint with its contact at the top of the slope and refuses a slope the footing cannot cover", () => {
    const noQuay = { ...quayPort, decorations: [] };
    const [hx, , hz] = hexToWorld(quayPort.hex);
    const pierRoot = { x: hx + 5, z: hz + 5 };
    const reach = 0.1;
    const ramp = (grade: number): GroundField => ({ sampleHeight: (x) => 0.1 + grade * (x - hx) });
    // Grade 0.4 over a 0.2-wide footprint: a 0.08 spread, inside what the footing covers.
    const gentle = standBuilding(settlementGround(noQuay, ramp(0.4), 0), { x: hx, z: hz }, reach, BUILDING_FOOTING, pierRoot, []);
    expect(gentle).not.toBeNull();
    expect(gentle!.y).toBeCloseTo(buildingGroundY(0.1 + 0.4 * reach), 9);
    expect(gentle!.y - BUILDING_FOOTING).toBeLessThanOrEqual(0.1 - 0.4 * reach - BUILDING_FOOTING_MARGIN + 1e-9);
    // Grade 0.8: a 0.16 spread, more than the footing less the sink and margin.
    expect(0.8 * 2 * reach).toBeGreaterThan(buildingMaxSpread(BUILDING_FOOTING));
    expect(standBuilding(settlementGround(noQuay, ramp(0.8), 0), { x: hx, z: hz }, reach, BUILDING_FOOTING, pierRoot, [])).toBeNull();
    // A deeper footing (a larger building) takes it.
    expect(standBuilding(settlementGround(noQuay, ramp(0.8), 0), { x: hx, z: hz }, reach, 0.2, pierRoot, [])).not.toBeNull();
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
      const range = scaleRangeOf(b.kind);
      expect(b.scale).toBeGreaterThanOrEqual(range[0]);
      expect(b.scale).toBeLessThanOrEqual(range[1]);
      expect(Math.abs(b.tint - 1)).toBeLessThanOrEqual(PORT_BUILDING_TINT_SPREAD);
    }
    expect(new Set(buildings.map((b) => b.tint.toFixed(4))).size).toBeGreaterThan(buildings.length / 2);
  });
});
