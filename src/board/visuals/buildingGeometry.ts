/**
 * Faceted port building mesh data (issue #49). Pure, no Three.js.
 *
 * Four kinds: a warehouse (long, gable to the water), a tavern (two storeys,
 * long side to the water), a gabled house and a watchtower, the tallest.
 * Local space: Y up, the ground contact at the origin, the front (door) on
 * +Z, so a yaw of the pier's rotation turns it to face the docking hex.
 * Walls carry on below the ground as a footing, so a building on a slope is
 * buried on the high side rather than floating on the low one. Colours are
 * per vertex (walls, roof, timber trim); the caller picks them per kind.
 */
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

export type BuildingKind = "warehouse" | "tavern" | "house" | "watchtower";

export const BUILDING_KINDS: readonly BuildingKind[] = ["warehouse", "tavern", "house", "watchtower"];

export interface BuildingColors {
  wall: Rgb;
  roof: Rgb;
  /** Doors, shutters and window frames. */
  timber: Rgb;
  /** The watchtower's masonry. */
  stone: Rgb;
}

export type BuildingGeometryData = FacetGeometryData;

/** Nothing at a port stands taller than this (world units at scale 1, the label floats at 0.6). */
export const BUILDING_MAX_HEIGHT = 0.5;
/** How far the walls carry on below the ground contact. */
export const BUILDING_FOOTING = 0.06;
export const BUILDING_TRIANGLE_BUDGET = 120;

interface GabledSpec {
  /** Footprint along x and z. */
  w: number;
  d: number;
  eave: number;
  ridge: number;
  /** Axis the ridge runs along; the gables are at the ends of that axis. */
  ridgeAlong: "x" | "z";
  windows: number;
}

const GABLED: Readonly<Record<Exclude<BuildingKind, "watchtower">, GabledSpec>> = {
  warehouse: { w: 0.26, d: 0.18, eave: 0.13, ridge: 0.24, ridgeAlong: "z", windows: 0 },
  tavern: { w: 0.22, d: 0.18, eave: 0.17, ridge: 0.27, ridgeAlong: "x", windows: 2 },
  house: { w: 0.18, d: 0.14, eave: 0.1, ridge: 0.19, ridgeAlong: "z", windows: 1 },
};

const TOWER = {
  base: 0.14,
  top: 0.12,
  bodyTop: 0.34,
  parapet: 0.17,
  parapetBottom: 0.33,
  parapetTop: 0.4,
  roofBase: 0.18,
  apex: 0.46,
};

const ROOF_OVERHANG = 0.015;
const ROOF_THICKNESS = 0.012;
const FOOTING_SHADE = 0.8;
const DOOR = { halfWidth: 0.02, height: 0.06, proud: 0.006 };
const WINDOW = { halfWidth: 0.012, bottom: 0.1, top: 0.14, proud: 0.004 };
const SLIT = { halfWidth: 0.006, bottom: 0.2, top: 0.26, proud: 0.004 };

/** Top of each kind at scale 1 (the ridge or the tower's apex). */
export const BUILDING_HEIGHT: Readonly<Record<BuildingKind, number>> = {
  warehouse: GABLED.warehouse.ridge,
  tavern: GABLED.tavern.ridge,
  house: GABLED.house.ridge,
  watchtower: TOWER.apex,
};

const gabledHalfDiagonal = (s: GabledSpec) => Math.hypot(s.w / 2 + ROOF_OVERHANG, s.d / 2 + ROOF_OVERHANG);

/** Farthest any vertex reaches from the origin in plan, at scale 1 (the ground-placement footprint). */
export const BUILDING_HALF_DIAGONAL: Readonly<Record<BuildingKind, number>> = {
  warehouse: Math.ceil(gabledHalfDiagonal(GABLED.warehouse) * 200) / 200,
  tavern: Math.ceil(gabledHalfDiagonal(GABLED.tavern) * 200) / 200,
  house: Math.ceil(gabledHalfDiagonal(GABLED.house) * 200) / 200,
  watchtower: Math.ceil(Math.hypot(TOWER.roofBase / 2, TOWER.roofBase / 2) * 200) / 200,
};

/** A square ring of half-size `h` at height `y`, counter-clockwise from above. */
const squareRing = (h: number, y: number): Vec3[] => [
  [-h, y, -h],
  [-h, y, h],
  [h, y, h],
  [h, y, -h],
];

/** A thin box standing proud of a wall on the front (+z) face. */
function frontFixture(b: FacetBuilder, x: number, bottom: number, top: number, halfWidth: number, wallZ: number, proud: number, color: Rgb) {
  b.box([x - halfWidth, bottom, wallZ - proud], [x + halfWidth, top, wallZ + proud], color, { bottom: false });
}

/**
 * Two roof slabs meeting at a ridge. `u` is the across-slope axis (the slabs
 * fall away along ±u), `v` runs along the ridge; `toXZ` maps (u, v) into
 * the building's x and z.
 */
function addGableRoof(b: FacetBuilder, s: GabledSpec, color: Rgb) {
  const along = s.ridgeAlong;
  const halfU = (along === "z" ? s.w : s.d) / 2;
  const halfV = (along === "z" ? s.d : s.w) / 2;
  const slope = (s.ridge - s.eave) / halfU;
  const ue = halfU + ROOF_OVERHANG;
  const ye = s.eave - ROOF_OVERHANG * slope;
  const ve = halfV + ROOF_OVERHANG;
  const toXZ = (u: number, y: number, v: number): Vec3 => (along === "z" ? [u, y, v] : [v, y, u]);

  for (const side of [-1, 1]) {
    // Top surface corners in (u, v), ordered counter-clockwise from above for ridgeAlong "z".
    const uRidge = 0;
    const uEave = side * ue;
    const uMin = Math.min(uRidge, uEave);
    const uMax = Math.max(uRidge, uEave);
    const yAt = (u: number) => (Math.abs(u) < 1e-9 ? s.ridge : ye);
    let top: Vec3[] = [
      toXZ(uMin, yAt(uMin), -ve),
      toXZ(uMin, yAt(uMin), ve),
      toXZ(uMax, yAt(uMax), ve),
      toXZ(uMax, yAt(uMax), -ve),
    ];
    // Swapping the axes mirrors the ring, so reverse it to stay counter-clockwise.
    if (along === "x") top = [top[0], top[3], top[2], top[1]];
    const bottom = top.map((p): Vec3 => [p[0], p[1] - ROOF_THICKNESS, p[2]]);
    b.prism(bottom, top, color);
  }
}

function addGabled(b: FacetBuilder, s: GabledSpec, colors: BuildingColors) {
  const hw = s.w / 2;
  const hd = s.d / 2;
  // Footing below ground, then the walls up to the eaves.
  b.box([-hw, -BUILDING_FOOTING, -hd], [hw, 0, hd], shadeRgb(colors.wall, FOOTING_SHADE), { top: false });
  b.box([-hw, 0, -hd], [hw, s.eave, hd], colors.wall, { bottom: false });

  // Gable triangles fill the wall up to the ridge at the ends of the ridge axis.
  if (s.ridgeAlong === "z") {
    b.triangle([-hw, s.eave, hd], [hw, s.eave, hd], [0, s.ridge, hd], colors.wall);
    b.triangle([-hw, s.eave, -hd], [0, s.ridge, -hd], [hw, s.eave, -hd], colors.wall);
  } else {
    b.triangle([hw, s.eave, -hd], [hw, s.ridge, 0], [hw, s.eave, hd], colors.wall);
    b.triangle([-hw, s.eave, -hd], [-hw, s.eave, hd], [-hw, s.ridge, 0], colors.wall);
  }
  addGableRoof(b, s, colors.roof);

  // Door on the front, windows either side of it.
  frontFixture(b, 0, 0, DOOR.height, DOOR.halfWidth, hd, DOOR.proud, colors.timber);
  for (let i = 0; i < s.windows; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * hw * 0.55;
    frontFixture(b, x, WINDOW.bottom, WINDOW.top, WINDOW.halfWidth, hd, WINDOW.proud, colors.timber);
  }
}

function addWatchtower(b: FacetBuilder, colors: BuildingColors) {
  // A tapering body on a footing, a wider parapet, and a pyramid roof.
  b.prism(squareRing(TOWER.base / 2, -BUILDING_FOOTING), squareRing(TOWER.base / 2, 0), shadeRgb(colors.stone, FOOTING_SHADE), {
    top: false,
  });
  b.prism(squareRing(TOWER.base / 2, 0), squareRing(TOWER.top / 2, TOWER.bodyTop), colors.stone, { bottom: false });
  b.prism(squareRing(TOWER.parapet / 2, TOWER.parapetBottom), squareRing(TOWER.parapet / 2, TOWER.parapetTop), colors.stone);
  const apex: Vec3 = [0, TOWER.apex, 0];
  b.prism(squareRing(TOWER.roofBase / 2, TOWER.parapetTop), [apex, apex, apex, apex], colors.roof, { bottom: false });

  // Door and a slit window on the front; the wall tapers, so sit them on the wall at their own height.
  const wallZAt = (y: number) => TOWER.base / 2 + (TOWER.top / 2 - TOWER.base / 2) * (y / TOWER.bodyTop);
  frontFixture(b, 0, 0, DOOR.height, DOOR.halfWidth, wallZAt(DOOR.height / 2), DOOR.proud, colors.timber);
  frontFixture(b, 0, SLIT.bottom, SLIT.top, SLIT.halfWidth, wallZAt((SLIT.bottom + SLIT.top) / 2), SLIT.proud, colors.timber);
}

/** Builds one kind's triangles at scale 1. Colours are linear RGB in [0, 1]. */
export function buildBuildingGeometry(kind: BuildingKind, colors: BuildingColors): BuildingGeometryData {
  const b = createFacetBuilder();
  if (kind === "watchtower") addWatchtower(b, colors);
  else addGabled(b, GABLED[kind], colors);
  return b.build();
}
