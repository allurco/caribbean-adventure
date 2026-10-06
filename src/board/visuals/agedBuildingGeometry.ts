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
  faceQuad,
  faceSlab,
  flakingTint,
  GRIME_BAND,
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
import { seedOf } from "./variationStream";

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

/**
 * The faceted kinds' footprints (`GABLED` in buildingGeometry.ts). The
 * house's and warehouse's eaves stand 0.04 and 0.03 higher than the faceted
 * kinds' at the same pitch: with the eave at 0.10 the house read as a hut
 * sunk to its sills (#59).
 */
const GABLED: Readonly<Record<Exclude<BuildingKind, "watchtower">, AgedGabledSpec>> = {
  warehouse: { w: 0.26, d: 0.18, eave: 0.16, ridge: 0.27, ridgeAlong: "z", windows: 0, hatch: true },
  tavern: { w: 0.22, d: 0.18, eave: 0.17, ridge: 0.27, ridgeAlong: "x", windows: 2, sign: true },
  house: { w: 0.18, d: 0.14, eave: 0.14, ridge: 0.23, ridgeAlong: "z", windows: 1 },
};

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

/** Top of each kind at scale 1 (the ridge cap or the pole tip). */
export const AGED_BUILDING_HEIGHT: Readonly<Record<BuildingKind, number>> = {
  warehouse: roofTop(roofSpec(GABLED.warehouse)),
  tavern: roofTop(roofSpec(GABLED.tavern)),
  house: roofTop(roofSpec(GABLED.house)),
  watchtower: AGED_TOWER.pole.top,
};

/** Top of each kind's walls at scale 1: where the roof's underside meets them, or the tower body's top. */
export const AGED_BUILDING_WALL_TOP: Readonly<Record<BuildingKind, number>> = {
  warehouse: roofEaveUnderside(roofSpec(GABLED.warehouse)),
  tavern: roofEaveUnderside(roofSpec(GABLED.tavern)),
  house: roofEaveUnderside(roofSpec(GABLED.house)),
  watchtower: AGED_TOWER.bodyTop,
};

const gabledHalfDiagonal = (s: AgedGabledSpec): number => {
  const r = roofSpec(s);
  const [lx, lz] = AGED_LEAN_OF[s === GABLED.warehouse ? "warehouse" : s === GABLED.tavern ? "tavern" : "house"];
  // The farthest corner is at the eave, so the lean counts at that height.
  const u = roofReachU(r) + Math.abs(s.ridgeAlong === "z" ? lx : lz) * s.eave;
  const v = r.halfV + AGED_ROOF_OVERHANG + Math.abs(s.ridgeAlong === "z" ? lz : lx) * s.eave;
  return Math.ceil(Math.hypot(u, v) * 200) / 200;
};

/** Farthest any vertex reaches from the origin in plan, at scale 1 (the ground-placement footprint). */
export const AGED_BUILDING_HALF_DIAGONAL: Readonly<Record<BuildingKind, number>> = {
  warehouse: gabledHalfDiagonal(GABLED.warehouse),
  tavern: gabledHalfDiagonal(GABLED.tavern),
  house: gabledHalfDiagonal(GABLED.house),
  watchtower:
    Math.ceil((Math.hypot(AGED_TOWER.halfBase, AGED_TOWER.halfBase) + Math.hypot(...AGED_LEAN_OF.watchtower) * AGED_TOWER.ledge.top) * 200) / 200,
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
 * and door 50; its flag (36) is a separate mesh.
 */
export const AGED_BUILDING_TRIANGLES: Readonly<Record<BuildingKind, number>> = {
  warehouse: 458,
  tavern: 610,
  house: 458,
  watchtower: 572,
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

function addAgedGabled(b: FacetBuilder, kind: Exclude<BuildingKind, "watchtower">, s: AgedGabledSpec, colors: AgedColors) {
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

/** Builds one kind's triangles at scale 1, leaning as a whole. Colours are linear RGB in [0, 1]. */
export function buildAgedBuildingGeometry(kind: BuildingKind, colors: AgedColors): AgedBuildingGeometryData {
  const b = createFacetBuilder();
  if (kind === "watchtower") addAgedTower(b, colors);
  else addAgedGabled(b, kind, GABLED[kind], colors);
  const [lx, lz] = AGED_LEAN_OF[kind];
  b.shear(0, b.vertexCount(), "x", "y", lx);
  b.shear(0, b.vertexCount(), "z", "y", lz);
  return b.build();
}
