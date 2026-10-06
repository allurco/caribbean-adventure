/**
 * The aged port buildings (issue #59). Pure, no Three.js.
 *
 * The four kinds the settlement draws, rebuilt from the aged kit as an old
 * Spanish-Caribbean port: lime-rendered walls grimed at the foot, flaking
 * and streaked under the windows and eave corners, with worn corners and a
 * lean of a degree or two; tiled roofs in uneven rows under a sagging
 * ridge; planked doors and shutters hanging open; and the watchtower, now
 * the port's landmark: a tapering body of rough-cut stone courses under a
 * string course, a parapet with merlons, and a flagpole flying the owning
 * nation's flag (`nationFlagGeometry.ts`, drawn as its own mesh with the
 * tower's matrix). Clearly the tallest thing in the settlement, up to the
 * height cap.
 *
 * Same local-space contract as the faceted pieces (`buildingGeometry.ts`):
 * ground contact at the origin, the door on +z, a footing below ground,
 * under `BUILDING_MAX_HEIGHT`. Footprints match the faceted kinds so the
 * settlement layout is unchanged in plan.
 */
import { BUILDING_FOOTING, BUILDING_KINDS, WINDOW_EAVE_MARGIN, type BuildingKind } from "./buildingGeometry";
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import {
  AGED_LEAN,
  boxFace,
  CORNER_CUT_RANGE,
  faceQuad,
  faceSlab,
  flakingTint,
  GRIME_BAND,
  panel,
  plankedDoor,
  shutteredWindow,
  stoneCourses,
  streak,
  taperedFace,
  tintGrime,
  wornCuts,
  wornPrism,
  type AgedColors,
  type FaceFrame,
  type WallFace,
} from "./agedKit";
import {
  addAgedRoof,
  AGED_ROOF_OVERHANG,
  roofEaveUnderside,
  roofGableApex,
  roofReachU,
  roofSlope,
  roofTop,
  type AgedRoofSpec,
} from "./agedRoof";
import type { Rgb } from "./palmGeometry";
import { seedOf, stream } from "./variationStream";

export type { AgedColors } from "./agedKit";
export type AgedBuildingGeometryData = FacetGeometryData;

interface AgedGabledSpec {
  w: number;
  d: number;
  eave: number;
  ridge: number;
  ridgeAlong: "x" | "z";
  windows: number;
  /** A hatch high in the front gable (the warehouse's loft). */
  hatch?: boolean;
  /** A board hung out from the front wall under the eave (the tavern's sign). */
  sign?: boolean;
}

type GabledKind = Exclude<BuildingKind, "watchtower" | "church">;

/** The faceted kinds' footprints and heights (`GABLED` in buildingGeometry.ts). */
const GABLED: Readonly<Record<GabledKind, AgedGabledSpec>> = {
  warehouse: { w: 0.26, d: 0.18, eave: 0.13, ridge: 0.24, ridgeAlong: "z", windows: 0, hatch: true },
  tavern: { w: 0.22, d: 0.18, eave: 0.17, ridge: 0.27, ridgeAlong: "x", windows: 2, sign: true },
  house: { w: 0.18, d: 0.14, eave: 0.1, ridge: 0.19, ridgeAlong: "z", windows: 1 },
};

/**
 * The parish church at scale 1: a single nave 0.2 across by 0.3 along z
 * (ridge along z, the door on +z), whitewashed, under the aged tile roof,
 * with a bell gable (espadaña) on the front wall: a flat screen 0.035
 * thick rising above the roof with two round-headed openings each
 * holding a bell, under a small pediment and an iron cross. The roof tucks
 * behind the screen at the front and overhangs the back gable as usual.
 */
export const AGED_CHURCH = {
  w: 0.2,
  d: 0.3,
  eave: 0.18,
  ridge: 0.3,
  facade: {
    thickness: 0.035,
    /** Top of the full-width part of the front wall, above the eave. */
    shoulder: 0.215,
    /** Half-width of the bell screen. */
    screenHalf: 0.07,
    /** Where the sloped shoulders meet the screen's sides: the shoulders run about parallel to the roof, 0.03 above the tiles. */
    screenFoot: 0.25,
    /** The bell openings run from the sill up to the arch crown; the arch springs at `spring`. */
    sill: 0.31,
    spring: 0.345,
    crown: 0.361,
    bandTop: 0.378,
    pedimentTop: 0.396,
  },
  /** Each opening's centre (±x) and the arch radius (half its width). */
  opening: { centre: 0.032, radius: 0.016 },
  bell: { top: 0.344, bottom: 0.318, radius: 0.0105 },
  cross: { top: 0.42, halfWidth: 0.003, armHalf: 0.012, armY: 0.408, thickness: 0.006 },
  door: { halfWidth: 0.024, height: 0.085, proud: 0.008, surround: 0.014, surroundProud: 0.013 },
  /** Three slit windows per long wall, high under the eave, as deep recesses. */
  window: { halfWidth: 0.007, bottom: 0.1, top: 0.135, count: 3 },
  /** Quoin blocks at the corners: alternating courses on the two faces of each corner. */
  quoin: { length: 0.03, courseHeight: 0.026, courses: 5, proud: 0.003 },
} as const;

/** The landmark tower at scale 1: a tapering body, a string course, a parapet with merlons, the pole. */
export const AGED_TOWER = {
  halfBase: 0.1,
  halfTop: 0.085,
  bodyTop: 0.36,
  ledge: { bottom: 0.36, top: 0.372, half: 0.098 },
  parapet: { bottom: 0.372, top: 0.405, half: 0.092 },
  merlon: { top: 0.428, width: 0.032, depth: 0.018, offset: 0.045 },
  pole: { radius: 0.006, topRadius: 0.0045, top: 0.49 },
} as const;

/** Each kind leans this much, x and z per unit of height (about 1.5° for the houses, under 1° for the tower). */
export const AGED_LEAN_OF: Readonly<Record<BuildingKind, readonly [number, number]>> = {
  warehouse: [AGED_LEAN * 0.8, -AGED_LEAN * 0.5],
  tavern: [-AGED_LEAN * 0.7, AGED_LEAN * 0.6],
  house: [AGED_LEAN * 0.9, AGED_LEAN * 0.4],
  watchtower: [0.012, -0.006],
  church: [AGED_LEAN * 0.4, -AGED_LEAN * 0.3],
};

/** The pole top, where the flag's hoist corner goes, in the tower's leaning frame. */
export const AGED_TOWER_FLAG_HOIST: Vec3 = [
  AGED_TOWER.pole.topRadius + 0.001 + AGED_LEAN_OF.watchtower[0] * (AGED_TOWER.pole.top - 0.003),
  AGED_TOWER.pole.top - 0.003,
  AGED_LEAN_OF.watchtower[1] * (AGED_TOWER.pole.top - 0.003),
];

const roofSpec = (s: AgedGabledSpec): AgedRoofSpec => ({
  halfU: (s.ridgeAlong === "z" ? s.w : s.d) / 2,
  halfV: (s.ridgeAlong === "z" ? s.d : s.w) / 2,
  eave: s.eave,
  ridge: s.ridge,
  ridgeAlong: s.ridgeAlong,
});

/**
 * How far behind the front wall's face the church's roof ends: just inside
 * the bell gable's back plane, so the eaves' end faces sit flush with it
 * (a hair in front, never on it) and nothing of the roof shows through
 * the screen.
 */
const CHURCH_ROOF_INSET = AGED_CHURCH.facade.thickness - 0.002;
/**
 * The church's roof: the usual overhang at the back, but at the front it
 * ends `CHURCH_ROOF_INSET` behind the front face, inside the bell gable's
 * wall, so the roof is built shorter and shifted back by `churchRoofShift`.
 */
export const churchRoofSpec = (): AgedRoofSpec => {
  const c = AGED_CHURCH;
  const length = c.d + AGED_ROOF_OVERHANG - CHURCH_ROOF_INSET;
  return { halfU: c.w / 2, halfV: length / 2 - AGED_ROOF_OVERHANG, eave: c.eave, ridge: c.ridge, ridgeAlong: "z" };
};
const churchRoofShift = () => -(AGED_ROOF_OVERHANG + CHURCH_ROOF_INSET) / 2;

/** Top of each kind at scale 1 (the ridge cap or the pole tip). */
export const AGED_BUILDING_HEIGHT: Readonly<Record<BuildingKind, number>> = {
  warehouse: roofTop(roofSpec(GABLED.warehouse)),
  tavern: roofTop(roofSpec(GABLED.tavern)),
  house: roofTop(roofSpec(GABLED.house)),
  watchtower: AGED_TOWER.pole.top,
  church: AGED_CHURCH.cross.top,
};

/** Top of each kind's walls at scale 1: where the roof's underside meets them, or the tower body's top. */
export const AGED_BUILDING_WALL_TOP: Readonly<Record<BuildingKind, number>> = {
  warehouse: roofEaveUnderside(roofSpec(GABLED.warehouse)),
  tavern: roofEaveUnderside(roofSpec(GABLED.tavern)),
  house: roofEaveUnderside(roofSpec(GABLED.house)),
  watchtower: AGED_TOWER.bodyTop,
  church: roofEaveUnderside(churchRoofSpec()),
};

const gabledHalfDiagonal = (kind: GabledKind): number => {
  const s = GABLED[kind];
  const r = roofSpec(s);
  const [lx, lz] = AGED_LEAN_OF[kind];
  // The farthest corner is at the eave, so the lean counts at that height.
  const u = roofReachU(r) + Math.abs(s.ridgeAlong === "z" ? lx : lz) * s.eave;
  const v = r.halfV + AGED_ROOF_OVERHANG + Math.abs(s.ridgeAlong === "z" ? lz : lx) * s.eave;
  return Math.ceil(Math.hypot(u, v) * 200) / 200;
};

/** The church's farthest corner is the roof's rear eave corner (the front overhang is inside the facade; the screen is narrower than the nave). */
const churchHalfDiagonal = (): number => {
  const c = AGED_CHURCH;
  const [lx, lz] = AGED_LEAN_OF.church;
  const u = roofReachU(churchRoofSpec()) + Math.abs(lx) * c.eave;
  const v = c.d / 2 + AGED_ROOF_OVERHANG + Math.abs(lz) * c.eave;
  return Math.ceil(Math.hypot(u, v) * 200) / 200;
};

/** Farthest any vertex reaches from the origin in plan, at scale 1 (the ground-placement footprint). */
export const AGED_BUILDING_HALF_DIAGONAL: Readonly<Record<BuildingKind, number>> = {
  warehouse: gabledHalfDiagonal("warehouse"),
  tavern: gabledHalfDiagonal("tavern"),
  house: gabledHalfDiagonal("house"),
  church: churchHalfDiagonal(),
  watchtower:
    Math.ceil((Math.hypot(AGED_TOWER.halfBase, AGED_TOWER.halfBase) + Math.hypot(...AGED_LEAN_OF.watchtower) * AGED_TOWER.ledge.top) * 200) / 200,
};

/**
 * Half-extents of the walls in plan at scale 1 (x across the front, z front
 * to back): the ground a building actually stands on, as against the plan
 * circle above, which circumscribes the eaves and the lean as well and is
 * what keeps buildings apart.
 */
export const AGED_BUILDING_PLAN: Readonly<Record<BuildingKind, { halfW: number; halfD: number }>> = {
  warehouse: { halfW: GABLED.warehouse.w / 2, halfD: GABLED.warehouse.d / 2 },
  tavern: { halfW: GABLED.tavern.w / 2, halfD: GABLED.tavern.d / 2 },
  house: { halfW: GABLED.house.w / 2, halfD: GABLED.house.d / 2 },
  church: { halfW: AGED_CHURCH.w / 2, halfD: AGED_CHURCH.d / 2 },
  watchtower: { halfW: AGED_TOWER.halfBase, halfD: AGED_TOWER.halfBase },
};

export const AGED_BUILDING_TRIANGLE_BUDGET = 1000;
/**
 * What the builds below come to. A gabled piece is its footing 10 and
 * plinth course 10, walls 4 × 18 panels + 8 corner facets, two gables of 3,
 * four eave streaks of 2, the roof (`agedRoofTriangles`: 244 house and
 * warehouse, 312 tavern), a door 50, and its windows (62 each), hatch (22)
 * or sign (10). The tower is its footing 10 and plinth course 10, body 16,
 * the blocks (about 370, varying with the courses the hash lays), slit
 * recesses and streaks 20, ledge 28, parapet 36, eight merlons 80, pole 18
 * and door 50; its flag (36) is a separate mesh. The church is its footing
 * 10 and plinth course 10, walls 80, back gable 3, eave streaks 8, the
 * bell-gable facade 100 (base 18, shoulders 8, screen foot 4, piers,
 * reveals and sills 24, arch spandrels 32, band 4, sides 4, pediment 6),
 * the roof 332, cross 22, two bells 48, door 50 with its recess 2 and
 * stone surround 50, six slit windows 24 and twenty quoin blocks 40.
 */
export const AGED_BUILDING_TRIANGLES: Readonly<Record<BuildingKind, number>> = {
  warehouse: 458,
  tavern: 610,
  house: 458,
  watchtower: 572,
  church: 779,
};

const FOOTING_SHADE = 0.85;
/**
 * The plinth course: a band of the footing standing proud of the wall line
 * a little below ground contact, so where the ground falls away under a
 * building on a slope the exposed footing reads as a raised stone platform
 * (as colonial houses and churches on slopes were built) and not as a wall
 * sinking out of sight. Below ground contact, so the lean's pivot ring at
 * y = 0 is untouched.
 */
const PLINTH_COURSE = { top: -0.012, bottom: -0.03, proud: 0.004 };
const MORTAR_SHADE = 0.68;
const WALKWAY_SHADE = 0.72;
const WALL_JITTER = 0.04;
const DOOR = { halfWidth: 0.022, height: 0.062, proud: 0.008 };
const WINDOW = { halfWidth: 0.014, height: 0.03, top: 0.14 };
const SLIT = { halfWidth: 0.006, height: 0.045 };
const AO = { groundHeight: 0.035, groundStrength: 0.3, eaveReach: 0.03, eaveStrength: 0.4, concavity: 0.5 };
const SALT = 0x5a1d;

const kindSeed = (kind: BuildingKind, part: number) => seedOf([BUILDING_KINDS.indexOf(kind), part], SALT);

/** The stone footing below ground contact (10 triangles) with its proud plinth course (10 more). */
function plinth(b: FacetBuilder, hw: number, hd: number, stone: Rgb) {
  b.box([-hw, -BUILDING_FOOTING, -hd], [hw, 0, hd], shadeRgb(stone, FOOTING_SHADE), { top: false });
  const p = PLINTH_COURSE.proud;
  b.box([-hw - p, PLINTH_COURSE.bottom, -hd - p], [hw + p, PLINTH_COURSE.top, hd + p], stone, { bottom: false });
}

/** The window band on a wall whose roof underside is at `wallTop`: never into the roof. */
export function agedWindowBand(wallTop: number): { bottom: number; top: number } {
  const top = Math.min(WINDOW.top, wallTop - WINDOW_EAVE_MARGIN);
  return { bottom: top - WINDOW.height, top };
}

/**
 * A gable on `face`: a pentagon whose upper edges lie on the slab
 * undersides, so the worn top corners of the wall below it leave no gap
 * into the attic. `cutLeft` and `cutRight` are the wall's top-ring cuts at
 * that face's ends, `width` the face's full width.
 */
function gable(b: FacetBuilder, frame: FaceFrame, width: number, cutLeft: number, cutRight: number, wallTop: number, apex: number, slope: number, color: Rgb) {
  const bl = frame.at(cutLeft, wallTop);
  const br = frame.at(width - cutRight, wallTop);
  const tr = frame.at(width - cutRight, wallTop + cutRight * slope);
  const top = frame.at(width / 2, apex);
  const tl = frame.at(cutLeft, wallTop + cutLeft * slope);
  b.triangle(bl, br, tr, color);
  b.triangle(bl, tr, top, color);
  b.triangle(bl, top, tl, color);
}

/**
 * Which of a worn ring's four corner cuts bound a face at its left and right
 * ends, seen from outside, in `wornRingPoints` corner order: c0 is the
 * back-left corner (−x, −z), c1 front-left, c2 front-right, c3 back-right.
 */
export function faceCutIndices(face: WallFace): [number, number] {
  switch (face) {
    case "front":
      return [1, 2];
    case "back":
      return [3, 0];
    case "right":
      return [2, 3];
    case "left":
      return [0, 1];
  }
}

/** The top-ring cuts at a face's left and right ends, seen from outside, in `wornRingPoints` corner order. */
function faceCuts(face: WallFace, cuts: readonly [number, number, number, number]): [number, number] {
  const [l, r] = faceCutIndices(face);
  return [cuts[l], cuts[r]];
}

function addAgedGabled(b: FacetBuilder, kind: GabledKind, s: AgedGabledSpec, colors: AgedColors) {
  const hw = s.w / 2;
  const hd = s.d / 2;
  const roof = roofSpec(s);
  const wallTop = roofEaveUnderside(roof);
  const apex = roofGableApex(roof);
  const slope = roofSlope(roof);
  const bottomCuts = wornCuts(kindSeed(kind, 1));
  const topCuts = wornCuts(kindSeed(kind, 2));

  // The stone plinth below ground, then the worn, panelled walls up to the roof's underside.
  const wallsFrom = b.vertexCount();
  plinth(b, hw, hd, colors.stone);
  wornPrism(b, { hw, hd, y: 0, cuts: bottomCuts }, { hw, hd, y: wallTop, cuts: topCuts }, colors.wall, {
    panel: { cols: 3, rows: 3, cellTint: flakingTint(kindSeed(kind, 3)) },
    faces: { bottom: false, top: false },
    seed: kindSeed(kind, 4),
  });
  // Gables at the ends of the ridge axis.
  const gableFaces: [WallFace, WallFace] = s.ridgeAlong === "z" ? ["front", "back"] : ["right", "left"];
  const eaveFaces: [WallFace, WallFace] = s.ridgeAlong === "z" ? ["right", "left"] : ["front", "back"];
  const faceWidth = (face: WallFace) => (face === "front" || face === "back" ? s.w : s.d);
  for (const face of gableFaces) {
    const [cl, cr] = faceCuts(face, topCuts);
    gable(b, boxFace(face, hw, hd), faceWidth(face), cl, cr, wallTop, apex, slope, colors.wall);
  }
  tintGrime(b, wallsFrom, b.vertexCount(), GRIME_BAND * s.ridge);
  b.jitterColors(WALL_JITTER, kindSeed(kind, 5), wallsFrom, b.vertexCount());
  // Staining runs down from the eave corners of the long walls.
  for (const face of eaveFaces) {
    const frame = boxFace(face, hw, hd);
    const [cl, cr] = faceCuts(face, topCuts);
    const width = faceWidth(face);
    streak(b, frame, cl + 0.012, wallTop, wallTop * 0.45, 0.006, colors.wall);
    streak(b, frame, width - cr - 0.012, wallTop, wallTop * 0.35, 0.005, colors.wall);
  }

  addAgedRoof(b, roof, colors.roof, kindSeed(kind, 6));

  // The door in the middle of the front, windows either side of it.
  const front = boxFace("front", hw, hd);
  plankedDoor(b, front, { s: hw, halfWidth: DOOR.halfWidth, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);
  const band = agedWindowBand(wallTop);
  for (let i = 0; i < s.windows; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * hw * 0.55;
    shutteredWindow(b, front, { s: hw + x, halfWidth: WINDOW.halfWidth, bottom: band.bottom, top: band.top }, colors, kindSeed(kind, 7 + i));
  }
  if (s.hatch) {
    // A loft hatch of two planks high in the front gable, with its staining run.
    const hatch = { bottom: wallTop + 0.03, top: wallTop + 0.065, halfWidth: 0.018 };
    const gapS = 0.0015;
    faceSlab(b, front, hw - hatch.halfWidth, hw - gapS / 2, hatch.bottom, hatch.top, 0.005, colors.timber);
    faceSlab(b, front, hw + gapS / 2, hw + hatch.halfWidth, hatch.bottom, hatch.top, 0.005, shadeRgb(colors.timber, 0.82));
    streak(b, front, hw, hatch.bottom, 0.03, 0.012, colors.wall);
  }
  if (s.sign) {
    // A sign board hung out from the wall under the eave, beside the right-hand window.
    const sx = s.w - 0.03;
    // (A zero bevel: the box's back lies on the wall and is left out, which `box` cannot do.)
    b.bevelledBox([-hw + sx, band.top + 0.004, hd], [-hw + sx + 0.004, wallTop - 0.004, hd + 0.03], 0, shadeRgb(colors.timber, 0.9), { back: false });
  }

  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight,
    groundStrength: AO.groundStrength,
    concavityStrength: AO.concavity,
    centroid: [0, s.eave / 2, 0],
    overhangs: [{ y: wallTop, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
}

function addAgedTower(b: FacetBuilder, colors: AgedColors) {
  const t = AGED_TOWER;
  const kind: BuildingKind = "watchtower";
  const mortar = shadeRgb(colors.stone, MORTAR_SHADE);
  const halfAt = (y: number) => t.halfBase + (t.halfTop - t.halfBase) * Math.min(1, Math.max(0, y / t.bodyTop));
  const bottomCuts = wornCuts(kindSeed(kind, 1));
  const topCuts = wornCuts(kindSeed(kind, 2));
  const cutAt = (k: number, y: number) => bottomCuts[k] + (topCuts[k] - bottomCuts[k]) * (y / t.bodyTop);

  // The stone plinth, then the tapering mortar body the blocks lie on.
  const bodyFrom = b.vertexCount();
  plinth(b, t.halfBase, t.halfBase, colors.stone);
  wornPrism(
    b,
    { hw: t.halfBase, hd: t.halfBase, y: 0, cuts: bottomCuts },
    { hw: t.halfTop, hd: t.halfTop, y: t.bodyTop, cuts: topCuts },
    mortar,
    { faces: { bottom: false, top: false } }
  );
  // Blocks on each face, leaving the door and the slits as recesses.
  const faces: WallFace[] = ["front", "right", "back", "left"];
  const door = { s0: t.halfBase - DOOR.halfWidth - 0.01, s1: t.halfBase + DOOR.halfWidth + 0.01, y0: 0, y1: DOOR.height + 0.016 };
  const slits: Record<string, { y0: number; y1: number }[]> = {
    front: [{ y0: 0.17, y1: 0.17 + SLIT.height }, { y0: 0.26, y1: 0.26 + SLIT.height }],
    right: [{ y0: 0.21, y1: 0.21 + SLIT.height }],
    back: [{ y0: 0.19, y1: 0.19 + SLIT.height }],
    left: [{ y0: 0.24, y1: 0.24 + SLIT.height }],
  };
  faces.forEach((face, i) => {
    const frame = taperedFace(face, halfAt, 0, t.bodyTop);
    // The blocks run between the face's worn corner widths, in the ring's corner order (as the gabled walls' gables do).
    const [cl, cr] = faceCutIndices(face).map((k) => (y: number) => cutAt(k, y));
    const openings = [
      ...(face === "front" ? [door] : []),
      ...slits[face].map((o) => ({ s0: halfAt((o.y0 + o.y1) / 2) - SLIT.halfWidth - 0.006, s1: halfAt((o.y0 + o.y1) / 2) + SLIT.halfWidth + 0.006, ...o })),
    ];
    stoneCourses(
      b,
      { frame, widthAt: (y) => ({ left: cl(y), right: 2 * halfAt(y) - cr(y) }), y0: 0, y1: t.bodyTop, openings },
      colors.stone,
      kindSeed(kind, 10 + i)
    );
    for (const o of slits[face]) {
      const s = halfAt((o.y0 + o.y1) / 2);
      faceQuad(b, frame, s - SLIT.halfWidth, s + SLIT.halfWidth, o.y0, o.y1, 0.0008, shadeRgb(colors.stone, 0.1));
      streak(b, frame, s, o.y0, SLIT.height * 0.8, SLIT.halfWidth * 1.5, colors.stone);
    }
  });
  tintGrime(b, bodyFrom, b.vertexCount(), GRIME_BAND * t.bodyTop, 0.25);

  // The string course, the parapet (its top the walkway) and the merlons.
  const ledgeCuts = wornCuts(kindSeed(kind, 3));
  wornPrism(
    b,
    { hw: t.ledge.half, hd: t.ledge.half, y: t.ledge.bottom, cuts: ledgeCuts },
    { hw: t.ledge.half, hd: t.ledge.half, y: t.ledge.top, cuts: ledgeCuts },
    shadeRgb(colors.stone, 0.95)
  );
  const parapetFrom = b.vertexCount();
  const parapetCuts = wornCuts(kindSeed(kind, 4));
  wornPrism(
    b,
    { hw: t.parapet.half, hd: t.parapet.half, y: t.parapet.bottom, cuts: parapetCuts },
    { hw: t.parapet.half, hd: t.parapet.half, y: t.parapet.top, cuts: wornCuts(kindSeed(kind, 5)) },
    colors.stone,
    { faces: { bottom: false }, panel: { cols: 2, rows: 1, cellTint: flakingTint(kindSeed(kind, 6), 0.3, 0.92) }, seed: kindSeed(kind, 7) }
  );
  b.tintColors(parapetFrom, b.vertexCount(), ([, y]) => (y >= t.parapet.top - 1e-9 ? [WALKWAY_SHADE, WALKWAY_SHADE, WALKWAY_SHADE] : [1, 1, 1]));
  let merlon = 0;
  for (const face of faces) {
    const frame = boxFace(face, t.parapet.half, t.parapet.half);
    for (const side of [-1, 1]) {
      const s = t.parapet.half + side * t.merlon.offset;
      const chipped = merlon === 5;
      const top = chipped ? t.merlon.top - 0.009 : t.merlon.top;
      const halfWidth = (chipped ? 0.8 : 1) * (t.merlon.width / 2);
      const from = b.vertexCount();
      // Built on the front at the parapet edge, then turned onto its face.
      b.box([s - halfWidth, t.parapet.top, t.parapet.half - t.merlon.depth], [s + halfWidth, top, t.parapet.half], shadeRgb(colors.stone, 0.9 + 0.05 * (merlon % 3)), { bottom: false });
      b.translate(from, b.vertexCount(), [-t.parapet.half, 0, 0]);
      const angle = Math.atan2(frame.normal[0], frame.normal[2]);
      b.rotate(from, b.vertexCount(), "y", angle);
      merlon++;
    }
  }

  // The flagpole, a tapering spar on the walkway.
  b.lathe(
    [
      [t.pole.radius, t.parapet.top],
      [t.pole.topRadius, t.pole.top - 0.003],
      [t.pole.topRadius, t.pole.top - 0.003],
      [0, t.pole.top],
    ],
    6,
    shadeRgb(colors.timber, 0.9)
  );

  // The door at the foot of the front, on the tapering face.
  const front = taperedFace("front", halfAt, 0, t.bodyTop);
  plankedDoor(b, front, { s: t.halfBase, halfWidth: DOOR.halfWidth - 0.002, height: DOOR.height, proud: DOOR.proud }, colors.timber, colors.iron);

  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight * 1.4,
    groundStrength: AO.groundStrength,
    // A tall body's walls all point a little away from its mid-height centroid; the concavity term would grime it all over.
    concavityStrength: 0,
    centroid: [0, t.bodyTop / 2, 0],
    overhangs: [{ y: t.ledge.bottom, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
}


/**
 * A polygon in the xy plane (counter-clockwise seen from +z) extruded
 * from `z0` to `z1`: the front face at `z1`, the back at `z0` (either may
 * be left out) and a side per edge where `edges[i]` is not false (edge
 * `i` runs from point `i` to point `i + 1`). Faces that meet a
 * neighbouring piece on a shared plane are left out that way. The caps
 * are fanned from point 0, so a concave outline must start at a corner
 * that sees every other point, or a triangle comes out inside out.
 */
function extrudedPolygon(
  b: FacetBuilder,
  poly: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  color: Rgb,
  options: { front?: boolean; back?: boolean; edges?: readonly boolean[] } = {}
) {
  const at = (p: readonly [number, number], z: number): Vec3 => [p[0], p[1], z];
  if (options.front !== false) for (let k = 1; k < poly.length - 1; k++) b.triangle(at(poly[0], z1), at(poly[k], z1), at(poly[k + 1], z1), color);
  if (options.back !== false) for (let k = 1; k < poly.length - 1; k++) b.triangle(at(poly[0], z0), at(poly[k + 1], z0), at(poly[k], z0), color);
  for (let k = 0; k < poly.length; k++) {
    if (options.edges?.[k] === false) continue;
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    b.quad(at(p, z0), at(q, z0), at(q, z1), at(p, z1), color);
  }
}

/** An open-backed slab on a face over any convex outline (counter-clockwise seen from outside): the front and a side per edge. */
function facePolygonSlab(b: FacetBuilder, frame: FaceFrame, pts: readonly (readonly [number, number])[], proud: number, color: Rgb) {
  const off: Vec3 = [frame.normal[0] * proud, frame.normal[1] * proud, frame.normal[2] * proud];
  const back = pts.map(([s, y]) => frame.at(s, y));
  const front = back.map((p): Vec3 => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
  for (let k = 1; k < pts.length - 1; k++) b.triangle(front[0], front[k], front[k + 1], color);
  for (let k = 0; k < pts.length; k++) {
    const k1 = (k + 1) % pts.length;
    b.quad(back[k], back[k1], front[k1], front[k], color);
  }
}

/**
 * The bell gable (espadaña) on the church's front wall, from the wall top
 * up: a full-width base to the shoulder line, sloped shoulders up to a
 * screen that stands above the roof, pierced by two round-headed openings
 * (the arch heads in two facets each) over a sill, under a flat band, a
 * pediment and the cross. Built as convex pieces that meet on shared
 * planes with the hidden faces dropped. `cl` and `cr` are the front wall's
 * top-ring corner cuts, which the base is inset by so it sits on the worn
 * corners rather than over them.
 */
function addChurchBellGable(b: FacetBuilder, wallTop: number, cl: number, cr: number, colors: AgedColors, seed: number) {
  const c = AGED_CHURCH;
  const f = c.facade;
  const hw = c.w / 2;
  const z1 = c.d / 2;
  const z0 = z1 - f.thickness;
  const xs = f.screenHalf;
  const wall = colors.wall;
  const left = -hw + cl;
  const right = hw - cr;

  // The base: its front panelled like the walls below so the flaking carries on up it.
  panel(b, [left, wallTop, z1], [right, wallTop, z1], [right, f.shoulder, z1], [left, f.shoulder, z1], { cols: 3, rows: 2, cellTint: flakingTint(seed) }, wall, seed, 1);
  extrudedPolygon(b, [[left, wallTop], [right, wallTop], [right, f.shoulder], [left, f.shoulder]], z0, z1, wall, { front: false, edges: [false, true, false, true] });
  // The shoulders slope up from the base's ends to the screen's feet.
  extrudedPolygon(b, [[xs, f.shoulder], [right, f.shoulder], [xs, f.screenFoot]], z0, z1, wall, { edges: [false, true, false] });
  extrudedPolygon(b, [[-xs, f.shoulder], [-xs, f.screenFoot], [left, f.shoulder]], z0, z1, wall, { edges: [false, true, false] });
  // The screen's foot, up to the openings' sill; its sides from the shoulders up are one strip each, added below.
  extrudedPolygon(b, [[-xs, f.shoulder], [xs, f.shoulder], [xs, f.sill], [-xs, f.sill]], z0, z1, wall, { edges: [false, false, false, false] });
  const r = c.opening.radius;
  const xc = c.opening.centre;
  // Three piers between and beside the openings, sill to crown; their reveals face into the openings, sill to spring.
  const piers: [number, number][] = [
    [-xs, -xc - r],
    [-xc + r, xc - r],
    [xc + r, xs],
  ];
  for (const [x0, x1] of piers) {
    extrudedPolygon(b, [[x0, f.sill], [x1, f.sill], [x1, f.crown], [x0, f.crown]], z0, z1, wall, { edges: [false, false, false, false] });
  }
  for (const side of [-1, 1] as const) {
    const centre = side * xc;
    // The sill floor of the opening, facing up, and the two reveals.
    b.quad([centre - r, f.sill, z0], [centre - r, f.sill, z1], [centre + r, f.sill, z1], [centre + r, f.sill, z0], shadeRgb(wall, 0.9));
    b.quad([centre - r, f.sill, z1], [centre - r, f.sill, z0], [centre - r, f.spring, z0], [centre - r, f.spring, z1], shadeRgb(wall, 0.85));
    b.quad([centre + r, f.sill, z0], [centre + r, f.sill, z1], [centre + r, f.spring, z1], [centre + r, f.spring, z0], shadeRgb(wall, 0.85));
    // The arch head: a spandrel each side of the crown, its soffit in two facets (at 45° and the crown).
    // Each spandrel is concave at its mid-arc point, so its fan must start at the outer corner (lt, rt).
    const k = Math.SQRT1_2;
    const lo: [number, number] = [centre - r, f.spring];
    const lm: [number, number] = [centre - r * k, f.spring + r * k];
    const crown: [number, number] = [centre, f.crown];
    const lt: [number, number] = [centre - r, f.crown];
    extrudedPolygon(b, [lt, lo, lm, crown], z0, z1, wall, { edges: [false, true, true, false] });
    const ro: [number, number] = [centre + r, f.spring];
    const rm: [number, number] = [centre + r * k, f.spring + r * k];
    const rt: [number, number] = [centre + r, f.crown];
    extrudedPolygon(b, [rt, crown, rm, ro], z0, z1, wall, { edges: [false, true, true, false] });
  }
  // The band over the arches, the screen's sides, and the pediment.
  extrudedPolygon(b, [[-xs, f.crown], [xs, f.crown], [xs, f.bandTop], [-xs, f.bandTop]], z0, z1, wall, { edges: [false, false, false, false] });
  // (Wound to face ±x: a quad on a plane of constant x faces +x when its first edge runs −z.)
  b.quad([xs, f.screenFoot, z1], [xs, f.screenFoot, z0], [xs, f.bandTop, z0], [xs, f.bandTop, z1], wall);
  b.quad([-xs, f.screenFoot, z0], [-xs, f.screenFoot, z1], [-xs, f.bandTop, z1], [-xs, f.bandTop, z0], wall);
  extrudedPolygon(b, [[-xs, f.bandTop], [xs, f.bandTop], [0, f.pedimentTop]], z0, z1, wall, { edges: [false, true, true] });
}

/** The two bells, hanging in the openings: a small lathe each, bronze. */
function addChurchBells(b: FacetBuilder, colors: AgedColors) {
  const c = AGED_CHURCH;
  const zc = c.d / 2 - c.facade.thickness / 2;
  for (const side of [-1, 1] as const) {
    const from = b.vertexCount();
    // The profile runs bottom to top, as `lathe` wants it (outward is to the right of the direction of travel).
    b.lathe(
      [
        [0, c.bell.bottom],
        [c.bell.radius, c.bell.bottom],
        [c.bell.radius * 0.6, c.bell.top - 0.004],
        [0, c.bell.top],
      ],
      6,
      colors.bronze
    );
    b.translate(from, b.vertexCount(), [side * c.opening.centre, 0, zc]);
  }
}

/** The iron cross on the pediment: a post with its foot in the pediment, and a thicker arm across it. */
function addChurchCross(b: FacetBuilder, colors: AgedColors) {
  const c = AGED_CHURCH;
  const zc = c.d / 2 - c.facade.thickness / 2;
  const hz = c.cross.thickness / 2;
  b.box([-c.cross.halfWidth, c.facade.pedimentTop - 0.006, zc - hz], [c.cross.halfWidth, c.cross.top, zc + hz], colors.iron, { bottom: false });
  // The arm stands a little proud of the post on both faces, so the two never share a plane.
  b.box([-c.cross.armHalf, c.cross.armY - 0.003, zc - hz - 0.0015], [c.cross.armHalf, c.cross.armY + 0.003, zc + hz + 0.0015], colors.iron);
}

/** The door: a tall planked door under a stone surround of two jambs and a three-facet round arch, a dark tympanum behind. */
function addChurchDoor(b: FacetBuilder, front: FaceFrame, colors: AgedColors) {
  const c = AGED_CHURCH;
  const d = c.door;
  const hw = c.w / 2;
  const ri = d.halfWidth;
  const ro = d.halfWidth + d.surround;
  // The recess under the arch above the door, on the wall plane; the lintel and voussoirs cover its edges.
  faceQuad(b, front, hw - ri, hw + ri, d.height, d.height + ri * Math.SQRT1_2 + 0.004, 0.0008, shadeRgb(colors.wall, 0.12));
  plankedDoor(b, front, { s: hw, halfWidth: d.halfWidth, height: d.height, proud: d.proud }, colors.timber, colors.iron);
  faceSlab(b, front, hw - ro, hw - ri, 0, d.height, d.surroundProud, colors.stone);
  faceSlab(b, front, hw + ri, hw + ro, 0, d.height, d.surroundProud, shadeRgb(colors.stone, 0.94));
  // Voussoirs: three facets over the half circle, from the right jamb round to the left.
  for (let k = 0; k < 3; k++) {
    const a0 = (k * Math.PI) / 3;
    const a1 = ((k + 1) * Math.PI) / 3;
    const pt = (radius: number, a: number): [number, number] => [hw + radius * Math.cos(a), d.height + radius * Math.sin(a)];
    facePolygonSlab(b, front, [pt(ri, a0), pt(ro, a0), pt(ro, a1), pt(ri, a1)], d.surroundProud, shadeRgb(colors.stone, 0.9 + 0.06 * k));
  }
}

/** Quoins: blocks of stone at each corner, in courses that alternate between the corner's two faces. */
function addChurchQuoins(b: FacetBuilder, colors: AgedColors, seed: number) {
  const c = AGED_CHURCH;
  const q = c.quoin;
  const hw = c.w / 2;
  const hd = c.d / 2;
  const next = stream(seed);
  // Each entry puts blocks at two opposite corners: even courses at the first face's right-hand end
  // (seen from outside), odd courses at the second face's left-hand end. Over the four entries every
  // corner is reached by both of its faces, once in each parity (front's right end is also right's left
  // end, and so on round), so the courses alternate between the two faces at every corner. The blocks
  // start past the corner's worn cut.
  const corners: [WallFace, WallFace, number][] = [
    ["front", "left", c.w],
    ["right", "front", c.d],
    ["back", "right", c.w],
    ["left", "back", c.d],
  ];
  const start = CORNER_CUT_RANGE[1];
  corners.forEach(([a, bFace, widthA], i) => {
    for (let k = 0; k < q.courses; k++) {
      const y0 = 0.012 + k * q.courseHeight;
      const y1 = y0 + q.courseHeight - 0.004;
      const length = q.length * (0.8 + next() * 0.4);
      const tone = shadeRgb(colors.stone, 0.88 + next() * 0.24);
      // Even courses lie on the first face at its right-hand end (the corner), odd ones on the second at its left-hand end.
      if ((k + i) % 2 === 0) faceQuad(b, boxFace(a, hw, hd), widthA - start - length, widthA - start, y0, y1, q.proud, tone);
      else faceQuad(b, boxFace(bFace, hw, hd), start, start + length, y0, y1, q.proud, tone);
    }
  });
}

function addAgedChurch(b: FacetBuilder, colors: AgedColors) {
  const c = AGED_CHURCH;
  const kind: BuildingKind = "church";
  const hw = c.w / 2;
  const hd = c.d / 2;
  const roof = churchRoofSpec();
  const wallTop = roofEaveUnderside(roof);
  const apex = roofGableApex(roof);
  const slope = roofSlope(roof);
  const bottomCuts = wornCuts(kindSeed(kind, 1));
  const topCuts = wornCuts(kindSeed(kind, 2));

  // The stone plinth, the worn panelled walls, the back gable and the bell gable on the front.
  const wallsFrom = b.vertexCount();
  plinth(b, hw, hd, colors.stone);
  wornPrism(b, { hw, hd, y: 0, cuts: bottomCuts }, { hw, hd, y: wallTop, cuts: topCuts }, colors.wall, {
    panel: { cols: 3, rows: 3, cellTint: flakingTint(kindSeed(kind, 3)) },
    faces: { bottom: false, top: false },
    seed: kindSeed(kind, 4),
  });
  const [bl, br] = faceCuts("back", topCuts);
  gable(b, boxFace("back", hw, hd), c.w, bl, br, wallTop, apex, slope, colors.wall);
  const [fl, fr] = faceCuts("front", topCuts);
  addChurchBellGable(b, wallTop, fl, fr, colors, kindSeed(kind, 8));
  tintGrime(b, wallsFrom, b.vertexCount(), GRIME_BAND * c.ridge);
  b.jitterColors(WALL_JITTER, kindSeed(kind, 5), wallsFrom, b.vertexCount());
  // Staining from the eave corners of the long walls.
  for (const face of ["right", "left"] as const) {
    const frame = boxFace(face, hw, hd);
    const [cl, cr] = faceCuts(face, topCuts);
    streak(b, frame, cl + 0.012, wallTop, wallTop * 0.45, 0.006, colors.wall);
    streak(b, frame, c.d - cr - 0.012, wallTop, wallTop * 0.35, 0.005, colors.wall);
  }

  // The roof, shorter at the front so it ends inside the bell gable's wall.
  const roofRange = addAgedRoof(b, roof, colors.roof, kindSeed(kind, 6));
  b.translate(roofRange.from, roofRange.to, [0, 0, churchRoofShift()]);

  addChurchBells(b, colors);
  addChurchCross(b, colors);
  addChurchDoor(b, boxFace("front", hw, hd), colors);
  // Slit windows high on the long walls, deep recesses with a staining run under each.
  for (const face of ["right", "left"] as const) {
    const frame = boxFace(face, hw, hd);
    for (let i = 0; i < c.window.count; i++) {
      const s = (c.d * (i + 1)) / (c.window.count + 1);
      faceQuad(b, frame, s - c.window.halfWidth, s + c.window.halfWidth, c.window.bottom, c.window.top, 0.0008, shadeRgb(colors.wall, 0.1));
      streak(b, frame, s, c.window.bottom, (c.window.top - c.window.bottom) * 0.9, c.window.halfWidth * 1.5, colors.wall);
    }
  }
  addChurchQuoins(b, colors, kindSeed(kind, 9));

  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight,
    groundStrength: AO.groundStrength,
    concavityStrength: AO.concavity,
    centroid: [0, c.eave / 2, 0],
    overhangs: [{ y: wallTop, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
}

/** Builds one kind's triangles at scale 1, leaning as a whole. Colours are linear RGB in [0, 1]. */
export function buildAgedBuildingGeometry(kind: BuildingKind, colors: AgedColors): AgedBuildingGeometryData {
  const b = createFacetBuilder();
  if (kind === "watchtower") addAgedTower(b, colors);
  else if (kind === "church") addAgedChurch(b, colors);
  else addAgedGabled(b, kind, GABLED[kind], colors);
  const [lx, lz] = AGED_LEAN_OF[kind];
  b.shear(0, b.vertexCount(), "x", "y", lx);
  b.shear(0, b.vertexCount(), "z", "y", lz);
  return b.build();
}
