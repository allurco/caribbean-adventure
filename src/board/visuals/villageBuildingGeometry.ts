/**
 * The village's own buildings (#87, ADR 0003). Pure, no Three.js.
 *
 * Five kinds, so the village is not one house repeated, all in the aged
 * kit's register (ADR 0002: worn corners, lime render grimed at the foot,
 * flaking cells, the aged tile roof, planked doors, shuttered windows, a
 * lean of a degree or two):
 *
 * - `cottage`: single-storey and whitewashed, ridge across the front, a
 *   door off centre, one window, a chimney at one gable.
 * - `stoneHouse`: two storeys of rough grey-brown stone with quoins and a
 *   string course at the floor, a door, three windows, a chimney.
 * - `merchant`: the larger house of the square and the waterfront, two
 *   storeys rendered in an ochre lime, a stone door surround, a timber
 *   balcony on brackets across the upper floor with tall shuttered openings
 *   onto it, two chimneys.
 * - `townHouse`: three storeys on a narrow plot (#176), washed in a pale
 *   rose lime over a stone ground floor, a string course at each floor, a
 *   door and a window below and two windows on each floor above, a chimney.
 * - `leanTo`: a plank annex under a mono-pitch tiled roof.
 * - `warehouse`: plank-walled, gable to the street, big double doors under
 *   a loft hatch, and a hoist beam from the gable's peak.
 *
 * The roofs are steep (#176): 55° and more on the houses, 45° on the
 * warehouse, so at the board camera's pitch the tiles, and their colour,
 * read over the walls.
 *
 * Same local contract as the aged pieces: ground contact at the origin, the
 * front on +z, the stone footing below ground. Each build reports the
 * vertex range of its roof tiles, so a merged village can colour each
 * roof on its own (`villageMesh.ts`).
 */
import { BUILDING_FOOTING } from "./buildingGeometry";
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import { AGED_LEAN, boxFace, faceQuad, faceSlab, flakingTint, plankedDoor, shutteredWindow, streak, tintGrime, wornCuts, wornPrism, GRIME_BAND, type AgedColors, type FaceFrame, type WallFace } from "./agedKit";
import { faceCuts, gable, plinth } from "./agedBuildingGeometry";
import { addAgedRoof, AGED_ROOF_OVERHANG, roofEaveUnderside, roofGableApex, roofPitch, roofReachU, roofSlope, roofTop, type AgedRoofSpec } from "./agedRoof";
import type { Rgb } from "./palmGeometry";
import { seedOf } from "./variationStream";

export type VillageVariant = "cottage" | "stoneHouse" | "merchant" | "leanTo" | "warehouse" | "townHouse";
export const VILLAGE_VARIANTS: readonly VillageVariant[] = ["cottage", "stoneHouse", "merchant", "leanTo", "warehouse", "townHouse"];

/** How many storeys each kind stands (the lean-to and the warehouse are one tall room). */
export const VILLAGE_STOREYS: Readonly<Record<VillageVariant, number>> = {
  cottage: 1,
  stoneHouse: 2,
  merchant: 2,
  leanTo: 1,
  warehouse: 1,
  townHouse: 3,
};

interface GabledSpec {
  w: number;
  d: number;
  eave: number;
  ridge: number;
  ridgeAlong: "x" | "z";
}

/** The gabled kinds' bodies at scale 1. */
const BODY: Readonly<Record<Exclude<VillageVariant, "leanTo">, GabledSpec>> = {
  cottage: { w: 0.17, d: 0.13, eave: 0.125, ridge: 0.22, ridgeAlong: "x" },
  stoneHouse: { w: 0.17, d: 0.15, eave: 0.235, ridge: 0.345, ridgeAlong: "x" },
  merchant: { w: 0.26, d: 0.17, eave: 0.245, ridge: 0.37, ridgeAlong: "x" },
  warehouse: { w: 0.3, d: 0.21, eave: 0.18, ridge: 0.33, ridgeAlong: "z" },
  townHouse: { w: 0.15, d: 0.14, eave: 0.3, ridge: 0.405, ridgeAlong: "x" },
};

/** The lean-to: plan, its front and back wall heights under the mono-pitch roof. */
const LEAN_TO = { w: 0.12, d: 0.09, front: 0.08, back: 0.11, overhang: 0.02, thickness: 0.012 };

/** The merchant's balcony: its floor's height and depth, rail height, how far it runs either side of the middle. */
const BALCONY = { floor: 0.122, slab: 0.009, depth: 0.04, rail: 0.04, half: 0.105 };
const STRING_COURSE = 0.118;
/** The town house's floors: the string courses' heights, at scale 1. */
const TOWN_HOUSE_FLOORS = [0.1, 0.195] as const;

/** Wall half extents at scale 1 (x across the front, z front to back). */
export const VILLAGE_PLAN: Readonly<Record<VillageVariant, { halfW: number; halfD: number }>> = {
  cottage: { halfW: BODY.cottage.w / 2, halfD: BODY.cottage.d / 2 },
  stoneHouse: { halfW: BODY.stoneHouse.w / 2, halfD: BODY.stoneHouse.d / 2 },
  merchant: { halfW: BODY.merchant.w / 2, halfD: BODY.merchant.d / 2 },
  leanTo: { halfW: LEAN_TO.w / 2, halfD: LEAN_TO.d / 2 },
  warehouse: { halfW: BODY.warehouse.w / 2, halfD: BODY.warehouse.d / 2 },
  townHouse: { halfW: BODY.townHouse.w / 2, halfD: BODY.townHouse.d / 2 },
};

/** How far past its walls each kind reaches in plan at scale 1 (eaves, balcony, hoist beam, lean): what keeps buildings apart. */
export const VILLAGE_EAVE: Readonly<Record<VillageVariant, number>> = {
  cottage: 0.035,
  stoneHouse: 0.035,
  merchant: 0.05,
  leanTo: 0.03,
  warehouse: 0.06,
  townHouse: 0.035,
};

/** Each kind leans this much, x and z per unit of height. */
const LEAN: Readonly<Record<VillageVariant, readonly [number, number]>> = {
  cottage: [AGED_LEAN * 0.7, -AGED_LEAN * 0.5],
  stoneHouse: [-AGED_LEAN * 0.4, AGED_LEAN * 0.3],
  merchant: [AGED_LEAN * 0.3, AGED_LEAN * 0.2],
  leanTo: [-AGED_LEAN * 0.9, AGED_LEAN * 0.6],
  warehouse: [AGED_LEAN * 0.6, -AGED_LEAN * 0.4],
  townHouse: [-AGED_LEAN * 0.3, -AGED_LEAN * 0.3],
};

/**
 * Per building: the merchant's house, with its balcony and two chimneys, is
 * the most (1074, with its roof's strips closed underneath, #91).
 */
export const VILLAGE_TRIANGLE_BUDGET = 1100;

export interface VillageBuildingGeometry {
  data: FacetGeometryData;
  /** The roof tiles' vertex range, for a per-building roof colour. */
  roofFrom: number;
  roofTo: number;
  /** Top of the building at scale 1. */
  height: number;
  /** Where later slices put smoke and light (#181), at scale 1, leaning with the building. */
  anchors: BuildingAnchors;
}

/**
 * Points on a building at scale 1, in its local frame (#181): each
 * chimney's mouth (where the life slice's smoke rises), each shuttered
 * window's middle a hair proud of the wall, and a lantern by the front door
 * (for a later night, ADR 0002 amendment (b)).
 */
export interface BuildingAnchors {
  chimneys: Vec3[];
  windows: Vec3[];
  lanterns: Vec3[];
}

const emptyAnchors = (): BuildingAnchors => ({ chimneys: [], windows: [], lanterns: [] });

const roofSpec = (s: GabledSpec): AgedRoofSpec => ({
  halfU: (s.ridgeAlong === "z" ? s.w : s.d) / 2,
  halfV: (s.ridgeAlong === "z" ? s.d : s.w) / 2,
  eave: s.eave,
  ridge: s.ridge,
  ridgeAlong: s.ridgeAlong,
});

const DOOR = { halfWidth: 0.021, height: 0.066, proud: 0.007 };
const WINDOW_HALF = 0.014;
/** How far proud of its wall a window's or a lantern's anchor stands. */
const ANCHOR_PROUD = 0.004;
/** A lantern's anchor: beside the door, this far out from its jamb and up from its head. */
const LANTERN_BESIDE = 0.012;
const LANTERN_OVER = 0.006;

/** A point on a wall face, `proud` out along its normal. */
const onFace = (frame: FaceFrame, s: number, y: number, proud: number): Vec3 => {
  const p = frame.at(s, y);
  return [p[0] + frame.normal[0] * proud, p[1] + frame.normal[1] * proud, p[2] + frame.normal[2] * proud];
};

/** A shuttered window, its middle recorded as an anchor. */
function windowAt(b: FacetBuilder, frame: FaceFrame, w: Parameters<typeof shutteredWindow>[2], colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  shutteredWindow(b, frame, w, colors, seed);
  anchors.windows.push(onFace(frame, w.s, (w.bottom + w.top) / 2, ANCHOR_PROUD));
}

/** The lantern's anchor beside a door whose middle is at `s`, `halfWidth` wide and `height` tall. */
function lanternBy(frame: FaceFrame, s: number, halfWidth: number, height: number, anchors: BuildingAnchors) {
  anchors.lanterns.push(onFace(frame, s + halfWidth + LANTERN_BESIDE, height + LANTERN_OVER, ANCHOR_PROUD * 2));
}
const AO = { groundHeight: 0.035, groundStrength: 0.3, eaveReach: 0.03, eaveStrength: 0.4, concavity: 0.5 };

/** The walls, gables and roof of a gabled body; returns its wall top and the roof's vertex range. */
function gabledBody(b: FacetBuilder, s: GabledSpec, colors: AgedColors, seed: number, panel: { cols: number; rows: number }) {
  const hw = s.w / 2;
  const hd = s.d / 2;
  const roof = roofSpec(s);
  const wallTop = roofEaveUnderside(roof);
  const apex = roofGableApex(roof);
  const slope = roofSlope(roof);
  const bottomCuts = wornCuts(seedOf([1], seed));
  const topCuts = wornCuts(seedOf([2], seed));
  const wallsFrom = b.vertexCount();
  plinth(b, hw, hd, colors.stone);
  wornPrism(b, { hw, hd, y: 0, cuts: bottomCuts }, { hw, hd, y: wallTop, cuts: topCuts }, colors.wall, {
    panel: { ...panel, cellTint: flakingTint(seedOf([3], seed)) },
    faces: { bottom: false, top: false },
    seed: seedOf([4], seed),
  });
  const gableFaces: [WallFace, WallFace] = s.ridgeAlong === "z" ? ["front", "back"] : ["right", "left"];
  const eaveFaces: [WallFace, WallFace] = s.ridgeAlong === "z" ? ["right", "left"] : ["front", "back"];
  const faceWidth = (face: WallFace) => (face === "front" || face === "back" ? s.w : s.d);
  for (const face of gableFaces) {
    const [cl, cr] = faceCuts(face, topCuts);
    gable(b, boxFace(face, hw, hd), faceWidth(face), cl, cr, wallTop, apex, slope, colors.wall);
  }
  tintGrime(b, wallsFrom, b.vertexCount(), GRIME_BAND * s.ridge);
  b.jitterColors(0.04, seedOf([5], seed), wallsFrom, b.vertexCount());
  for (const face of eaveFaces) {
    const frame = boxFace(face, hw, hd);
    const [cl, cr] = faceCuts(face, topCuts);
    streak(b, frame, cl + 0.012, wallTop, wallTop * 0.4, 0.006, colors.wall);
    streak(b, frame, faceWidth(face) - cr - 0.012, wallTop, wallTop * 0.3, 0.005, colors.wall);
  }
  const roofRange = addAgedRoof(b, roof, colors.roof, seedOf([6], seed));
  return { hw, hd, wallTop, apex, roofRange };
}

/** A chimney through the roof at (x, z), from inside the walls up past the ridge, with a cap slab. */
function chimney(b: FacetBuilder, x: number, z: number, bottom: number, top: number, color: Rgb, anchors: BuildingAnchors) {
  const half = 0.014;
  anchors.chimneys.push([x, top + 0.009, z]);
  b.box([x - half, bottom, z - half], [x + half, top, z + half], color, { bottom: false });
  b.box([x - half - 0.004, top, z - half - 0.004], [x + half + 0.004, top + 0.007, z + half + 0.004], shadeRgb(color, 0.8));
  // Soot at its mouth.
  b.box([x - half + 0.003, top + 0.007, z - half + 0.003], [x + half - 0.003, top + 0.009, z + half - 0.003], [0.04, 0.035, 0.03], { bottom: false });
}

/** Quoins: blocks at each front corner, alternating between the corner's two faces, over `courses` courses from the ground. */
function quoins(b: FacetBuilder, hw: number, hd: number, w: number, d: number, height: number, stone: Rgb, seed: number) {
  const corners: [WallFace, WallFace, number][] = [
    ["front", "left", w],
    ["right", "front", d],
    ["back", "right", w],
    ["left", "back", d],
  ];
  const course = 0.04;
  const courses = Math.floor(height / course);
  // Past the widest worn corner cut, so no block hangs over a chamfer.
  const start = 0.014;
  corners.forEach(([a, bFace, widthA], i) => {
    for (let k = 0; k < courses; k++) {
      const y0 = 0.006 + k * course;
      const y1 = y0 + course - 0.005;
      const tone = shadeRgb(stone, 0.86 + ((seedOf([i, k], seed) >>> 8) % 100) / 400);
      const length = 0.03 + ((k + i) % 3) * 0.007;
      if ((k + i) % 2 === 0) faceSlab(b, boxFace(a, hw, hd), widthA - start - length, widthA - start, y0, y1, 0.003, tone);
      else faceSlab(b, boxFace(bFace, hw, hd), start, start + length, y0, y1, 0.003, tone);
    }
  });
}

function aoBake(b: FacetBuilder, eave: number, wallTop: number) {
  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight,
    groundStrength: AO.groundStrength,
    concavityStrength: AO.concavity,
    centroid: [0, eave / 2, 0],
    overhangs: [{ y: wallTop, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
}

function addCottage(b: FacetBuilder, colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  const s = BODY.cottage;
  const { hw, hd, wallTop, roofRange } = gabledBody(b, s, colors, seed, { cols: 3, rows: 2 });
  const front = boxFace("front", hw, hd);
  plankedDoor(b, front, { s: hw - 0.035, halfWidth: DOOR.halfWidth, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);
  lanternBy(front, hw - 0.035, DOOR.halfWidth, DOOR.height, anchors);
  const top = Math.min(0.1, wallTop - 0.016);
  windowAt(b, front, { s: hw + 0.04, halfWidth: WINDOW_HALF, bottom: top - 0.032, top }, colors, seedOf([7], seed), anchors);
  chimney(b, hw - 0.028, -0.012, wallTop - 0.02, s.ridge + 0.03, colors.wall, anchors);
  aoBake(b, s.eave, wallTop);
  return roofRange;
}

function addStoneHouse(b: FacetBuilder, colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  const s = BODY.stoneHouse;
  const { hw, hd, wallTop, roofRange } = gabledBody(b, s, colors, seed, { cols: 3, rows: 3 });
  quoins(b, hw, hd, s.w, s.d, wallTop - 0.02, shadeRgb(colors.stone, 1.12), seedOf([8], seed));
  // The string course at the upper floor, on every face, between the quoins.
  for (const face of ["front", "right", "back", "left"] as const) {
    const width = face === "front" || face === "back" ? s.w : s.d;
    faceSlab(b, boxFace(face, hw, hd), 0.05, width - 0.05, STRING_COURSE, STRING_COURSE + 0.007, 0.004, shadeRgb(colors.stone, 1.18));
  }
  const front = boxFace("front", hw, hd);
  plankedDoor(b, front, { s: hw - 0.03, halfWidth: DOOR.halfWidth, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);
  lanternBy(front, hw - 0.03, DOOR.halfWidth, DOOR.height, anchors);
  windowAt(b, front, { s: hw + 0.042, halfWidth: WINDOW_HALF, bottom: 0.058, top: 0.092 }, colors, seedOf([9], seed), anchors);
  const upperTop = Math.min(0.19, wallTop - 0.016);
  for (const dx of [-0.042, 0.042]) {
    windowAt(b, front, { s: hw + dx, halfWidth: WINDOW_HALF, bottom: upperTop - 0.036, top: upperTop }, colors, seedOf([10, dx > 0 ? 1 : 0], seed), anchors);
  }
  chimney(b, -hw + 0.03, -0.015, wallTop - 0.02, s.ridge + 0.035, shadeRgb(colors.wall, 0.95), anchors);
  aoBake(b, s.eave, wallTop);
  return roofRange;
}

function addMerchant(b: FacetBuilder, colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  const s = BODY.merchant;
  const { hw, hd, wallTop, roofRange } = gabledBody(b, s, colors, seed, { cols: 3, rows: 3 });
  const front = boxFace("front", hw, hd);
  // The door under a stone surround, a window either side.
  const surround = 0.012;
  faceSlab(b, front, hw - DOOR.halfWidth - surround, hw - DOOR.halfWidth, 0, DOOR.height + surround, 0.006, colors.stone);
  faceSlab(b, front, hw + DOOR.halfWidth, hw + DOOR.halfWidth + surround, 0, DOOR.height + surround, 0.006, shadeRgb(colors.stone, 0.94));
  faceSlab(b, front, hw - DOOR.halfWidth, hw + DOOR.halfWidth, DOOR.height, DOOR.height + surround, 0.006, shadeRgb(colors.stone, 1.06));
  plankedDoor(b, front, { s: hw, halfWidth: DOOR.halfWidth, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);
  // Outside the door's stone surround.
  lanternBy(front, hw, DOOR.halfWidth + surround, DOOR.height, anchors);
  for (const dx of [-0.075, 0.075]) windowAt(b, front, { s: hw + dx, halfWidth: WINDOW_HALF, bottom: 0.05, top: 0.088 }, colors, seedOf([9, dx > 0 ? 1 : 0], seed), anchors);
  // Tall openings onto the balcony.
  for (const dx of [-0.055, 0.055]) {
    windowAt(b, front, { s: hw + dx, halfWidth: WINDOW_HALF, bottom: BALCONY.floor + BALCONY.slab, top: Math.min(BALCONY.floor + 0.085, wallTop - 0.014) }, colors, seedOf([11, dx], seed), anchors);
  }
  // The balcony: a planked floor on three brackets, a rail on balusters.
  const timber = colors.timber;
  const z0 = hd;
  const z1 = hd + BALCONY.depth;
  const y0 = BALCONY.floor;
  const y1 = BALCONY.floor + BALCONY.slab;
  b.box([-BALCONY.half, y0, z0], [BALCONY.half, y1, z1], shadeRgb(timber, 1.1), { bottom: true });
  for (const x of [-BALCONY.half + 0.006, 0, BALCONY.half - 0.006]) {
    // A bracket: a short post down the wall and a strut out under the floor.
    b.box([x - 0.004, y0 - 0.03, z0], [x + 0.004, y0, z0 + 0.006], timber, { top: false });
    b.box([x - 0.003, y0 - 0.008, z0 + 0.006], [x + 0.003, y0, z1 - 0.006], shadeRgb(timber, 0.9), { top: false });
  }
  const railTop = y1 + BALCONY.rail;
  b.box([-BALCONY.half, railTop - 0.006, z1 - 0.006], [BALCONY.half, railTop, z1], shadeRgb(timber, 1.05));
  for (const side of [-1, 1]) b.box([side * BALCONY.half - 0.003, railTop - 0.006, z0], [side * BALCONY.half + 0.003, railTop, z1], shadeRgb(timber, 1.05), { bottom: true });
  for (let i = 1; i < 6; i++) {
    const x = -BALCONY.half + (i / 6) * BALCONY.half * 2;
    b.box([x - 0.0025, y1, z1 - 0.005], [x + 0.0025, railTop - 0.006, z1 - 0.0005], timber, { bottom: false, top: false });
  }
  chimney(b, -hw + 0.032, -0.02, wallTop - 0.02, s.ridge + 0.03, colors.wall, anchors);
  chimney(b, hw - 0.032, -0.02, wallTop - 0.02, s.ridge + 0.03, colors.wall, anchors);
  aoBake(b, s.eave, wallTop);
  return roofRange;
}

function addTownHouse(b: FacetBuilder, colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  const s = BODY.townHouse;
  const { hw, hd, wallTop, roofRange } = gabledBody(b, s, colors, seed, { cols: 2, rows: 4 });
  // A string course at each upper floor, on every face.
  for (const y of TOWN_HOUSE_FLOORS) {
    for (const face of ["front", "right", "back", "left"] as const) {
      const width = face === "front" || face === "back" ? s.w : s.d;
      faceSlab(b, boxFace(face, hw, hd), 0.02, width - 0.02, y, y + 0.007, 0.004, shadeRgb(colors.stone, 1.12));
    }
  }
  const front = boxFace("front", hw, hd);
  plankedDoor(b, front, { s: hw - 0.03, halfWidth: DOOR.halfWidth, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);
  lanternBy(front, hw - 0.03, DOOR.halfWidth, DOOR.height, anchors);
  windowAt(b, front, { s: hw + 0.035, halfWidth: WINDOW_HALF, bottom: 0.045, top: 0.08 }, colors, seedOf([9], seed), anchors);
  // Two windows on each floor above, the top floor's under the eave.
  const tops = [TOWN_HOUSE_FLOORS[1] - 0.02, Math.min(TOWN_HOUSE_FLOORS[1] + 0.075, wallTop - 0.016)];
  tops.forEach((top, floor) => {
    for (const dx of [-0.035, 0.035]) {
      windowAt(b, front, { s: hw + dx, halfWidth: WINDOW_HALF, bottom: top - 0.034, top }, colors, seedOf([10, floor, dx > 0 ? 1 : 0], seed), anchors);
    }
  });
  chimney(b, hw - 0.028, -0.015, wallTop - 0.02, s.ridge + 0.03, shadeRgb(colors.wall, 0.95), anchors);
  aoBake(b, s.eave, wallTop);
  return roofRange;
}

function addWarehouse(b: FacetBuilder, colors: AgedColors, seed: number, anchors: BuildingAnchors) {
  const s = BODY.warehouse;
  const { hw, hd, wallTop, apex, roofRange } = gabledBody(b, s, colors, seed, { cols: 7, rows: 1 });
  const front = boxFace("front", hw, hd);
  // Big double doors: two planked leaves under one lintel, set in a dark opening.
  const leaf = 0.034;
  const height = 0.12;
  faceQuad(b, front, hw - leaf * 2 - 0.004, hw + leaf * 2 + 0.004, 0, height + 0.006, 0.0008, shadeRgb(colors.wall, 0.15));
  plankedDoor(b, front, { s: hw - leaf - 0.001, halfWidth: leaf, height, proud: DOOR.proud }, colors.timber, colors.iron);
  plankedDoor(b, front, { s: hw + leaf + 0.001, halfWidth: leaf, height, proud: DOOR.proud }, shadeRgb(colors.timber, 0.9), colors.iron);
  lanternBy(front, hw, leaf * 2 + 0.004, height - 0.03, anchors);
  // The loft hatch in the gable, and the hoist beam out from under the peak with its rope.
  const hatchBottom = wallTop + 0.012;
  const hatchTop = Math.min(apex - 0.03, hatchBottom + 0.04);
  faceSlab(b, front, hw - 0.022, hw - 0.001, hatchBottom, hatchTop, 0.005, colors.timber);
  faceSlab(b, front, hw + 0.001, hw + 0.022, hatchBottom, hatchTop, 0.005, shadeRgb(colors.timber, 0.82));
  const beamY = Math.min(apex - 0.014, hatchTop + 0.02);
  b.box([-0.006, beamY - 0.006, hd], [0.006, beamY + 0.006, hd + 0.06], shadeRgb(colors.timber, 0.85), { bottom: true });
  b.box([-0.0015, beamY - 0.05, hd + 0.05], [0.0015, beamY - 0.006, hd + 0.053], [0.12, 0.1, 0.07], { bottom: false, top: false });
  aoBake(b, s.eave, wallTop);
  return roofRange;
}

function addLeanTo(b: FacetBuilder, colors: AgedColors, seed: number) {
  const t = LEAN_TO;
  const hw = t.w / 2;
  const hd = t.d / 2;
  const cuts = wornCuts(seedOf([1], seed));
  const wallsFrom = b.vertexCount();
  plinth(b, hw, hd, colors.stone);
  wornPrism(b, { hw, hd, y: 0, cuts }, { hw, hd, y: t.front, cuts }, colors.wall, {
    panel: { cols: 4, rows: 1, cellTint: flakingTint(seedOf([3], seed)) },
    faces: { bottom: false, top: false },
    seed: seedOf([4], seed),
  });
  // Above the front wall's top: the back wall's band and the sloping tops of the sides.
  const rise = t.back - t.front;
  b.quad([hw - cuts[3], t.front, -hd], [-hw + cuts[0], t.front, -hd], [-hw + cuts[0], t.back, -hd], [hw - cuts[3], t.back, -hd], colors.wall);
  b.triangle([-hw, t.front, -hd + cuts[0]], [-hw, t.front, hd - cuts[1]], [-hw, t.back, -hd + cuts[0]], colors.wall);
  b.triangle([hw, t.front, hd - cuts[2]], [hw, t.front, -hd + cuts[3]], [hw, t.back, -hd + cuts[3]], colors.wall);
  // The back corners' worn facets carry on up to the back wall's top.
  const mid: Vec3 = [0, (t.front + t.back) / 2, 0];
  b.outwardQuad([-hw + cuts[0], t.front, -hd], [-hw, t.front, -hd + cuts[0]], [-hw, t.back, -hd + cuts[0]], [-hw + cuts[0], t.back, -hd], mid, colors.wall);
  b.outwardQuad([hw, t.front, -hd + cuts[3]], [hw - cuts[3], t.front, -hd], [hw - cuts[3], t.back, -hd], [hw, t.back, -hd + cuts[3]], mid, colors.wall);
  tintGrime(b, wallsFrom, b.vertexCount(), GRIME_BAND * t.back);
  b.jitterColors(0.05, seedOf([5], seed), wallsFrom, b.vertexCount());
  // The roof: a slab sloping from the back down to the front eave, with raised tile strips.
  const roofFrom = b.vertexCount();
  const slope = rise / t.d;
  const zf = hd + t.overhang;
  const zb = -hd - t.overhang * 0.5;
  const yAt = (z: number) => t.front + (hd - z) * slope;
  const x0 = -hw - t.overhang;
  const x1 = hw + t.overhang;
  const ring = (dy: number): Vec3[] => [
    [x0, yAt(zb) + dy, zb],
    [x0, yAt(zf) + dy, zf],
    [x1, yAt(zf) + dy, zf],
    [x1, yAt(zb) + dy, zb],
  ];
  b.prism(ring(0), ring(t.thickness), colors.roof);
  const strips = 7;
  for (let i = 0; i < strips; i++) {
    const xc = x0 + ((i + 0.5) / strips) * (x1 - x0);
    const half = ((x1 - x0) / strips) * 0.3;
    const over = (i % 3) * 0.003;
    const strip = (dy: number): Vec3[] => [
      [xc - half, yAt(zb) + t.thickness + dy, zb],
      [xc - half, yAt(zf + over) + t.thickness + dy, zf + over],
      [xc + half, yAt(zf + over) + t.thickness + dy, zf + over],
      [xc + half, yAt(zb) + t.thickness + dy, zb],
    ];
    b.prism(strip(0), strip(0.005), shadeRgb(colors.roof, 1.06 - (i % 2) * 0.08), { bottom: false });
  }
  const roofTo = b.vertexCount();
  const front = boxFace("front", hw, hd);
  plankedDoor(b, front, { s: hw - 0.018, halfWidth: 0.018, height: Math.min(DOOR.height, t.front - 0.01), proud: DOOR.proud }, colors.timber, colors.iron);
  aoBake(b, t.back, t.front);
  return { from: roofFrom, to: roofTo };
}

/** Top of each kind at scale 1. */
export const VILLAGE_HEIGHT: Readonly<Record<VillageVariant, number>> = {
  cottage: Math.max(roofTop(roofSpec(BODY.cottage)), BODY.cottage.ridge + 0.039),
  stoneHouse: Math.max(roofTop(roofSpec(BODY.stoneHouse)), BODY.stoneHouse.ridge + 0.044),
  merchant: Math.max(roofTop(roofSpec(BODY.merchant)), BODY.merchant.ridge + 0.039),
  leanTo: LEAN_TO.back + LEAN_TO.thickness + 0.02,
  warehouse: roofTop(roofSpec(BODY.warehouse)),
  townHouse: Math.max(roofTop(roofSpec(BODY.townHouse)), BODY.townHouse.ridge + 0.039),
};

/** A gabled kind's roof pitch (radians). */
export const villageRoofPitch = (variant: Exclude<VillageVariant, "leanTo">): number => roofPitch(roofSpec(BODY[variant]));

/** Farthest the roof reaches across its slope from the middle at scale 1 (for tests and the plan). */
export const villageRoofReach = (variant: Exclude<VillageVariant, "leanTo">): number => roofReachU(roofSpec(BODY[variant])) + AGED_ROOF_OVERHANG;

/** Builds one kind at scale 1, leaning as a whole. Colours are linear RGB; `seed` varies its wear. */
export function buildVillageBuilding(variant: VillageVariant, colors: AgedColors, seed = 0): VillageBuildingGeometry {
  const b = createFacetBuilder();
  const s = seedOf([VILLAGE_VARIANTS.indexOf(variant)], 0x7a11 ^ seed);
  const anchors = emptyAnchors();
  const roof =
    variant === "cottage"
      ? addCottage(b, colors, s, anchors)
      : variant === "stoneHouse"
        ? addStoneHouse(b, colors, s, anchors)
        : variant === "merchant"
          ? addMerchant(b, colors, s, anchors)
          : variant === "warehouse"
            ? addWarehouse(b, colors, s, anchors)
            : variant === "townHouse"
              ? addTownHouse(b, colors, s, anchors)
              : addLeanTo(b, colors, s);
  const [lx, lz] = LEAN[variant];
  b.shear(0, b.vertexCount(), "x", "y", lx);
  b.shear(0, b.vertexCount(), "z", "y", lz);
  // The anchors lean with the walls they stand on.
  const lean = (p: Vec3): Vec3 => [p[0] + lx * p[1], p[1], p[2] + lz * p[1]];
  const leaned: BuildingAnchors = { chimneys: anchors.chimneys.map(lean), windows: anchors.windows.map(lean), lanterns: anchors.lanterns.map(lean) };
  return { data: b.build(), roofFrom: roof.from, roofTo: roof.to, height: VILLAGE_HEIGHT[variant], anchors: leaned };
}

/** The footing depth every kind carries under its ground contact (the aged kit's). */
export const VILLAGE_FOOTING = BUILDING_FOOTING;

/** Every kind's anchors at scale 1 (#181): the same for every wear seed, so built once from the plainest colours. */
const ANCHORS_OF = new Map<VillageVariant, BuildingAnchors>();
export function villageAnchors(variant: VillageVariant): BuildingAnchors {
  let a = ANCHORS_OF.get(variant);
  if (!a) {
    const grey: Rgb = [0.5, 0.5, 0.5];
    a = buildVillageBuilding(variant, { wall: grey, roof: grey, timber: grey, stone: grey, iron: grey, bronze: grey }).anchors;
    ANCHORS_OF.set(variant, a);
  }
  return a;
}
