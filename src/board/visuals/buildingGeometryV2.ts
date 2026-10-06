/**
 * The "notch up" house for the fidelity probe (issue #59). Pure, no Three.js.
 *
 * The faceted house of `buildingGeometry.ts` rebuilt with the extended
 * builder: bevelled walls, thicker roof slabs with a wider overhang and a
 * ridge beam, bevelled door and window, occlusion baked under the eaves
 * and at the footing, and a slight colour jitter on the whitewash. Same
 * footprint and ridge as the faceted house, same local-space contract:
 * ground contact at the origin, the door on +z, a footing below ground,
 * under `BUILDING_MAX_HEIGHT`.
 *
 * Every part is a closed solid or an open-backed slab that meets its
 * neighbour on a shared plane with the hidden face dropped, so no face
 * passes through another and nothing is coplanar: the walls and gables
 * stop at the roof's underside, the two slabs start a little out from the
 * ridge so their inner corners meet on the midline instead of crossing,
 * the beam's bottom sits exactly where the slab tops reach its sides and
 * hides the slab ends, and the door and window stand on the wall plane.
 *
 * Feature sizes are chosen for ship zoom (camera 3.5–4.3 units off): a
 * 0.01 bevel is about two pixels there, a 0.02 roof edge about five.
 */
import { BUILDING_FOOTING, WINDOW_EAVE_MARGIN, type BuildingColors } from "./buildingGeometry";
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

/** The faceted house's footprint and heights (`GABLED.house` in buildingGeometry.ts). */
const HOUSE = { w: 0.18, d: 0.14, eave: 0.1, ridge: 0.19 };

export const HOUSE_V2_ROOF_THICKNESS = 0.02;
export const HOUSE_V2_ROOF_OVERHANG = 0.025;
const WALL_BEVEL = 0.01;
const ROOF_BEVEL = 0.006;
const FIXTURE_BEVEL = 0.003;
const DOOR = { halfWidth: 0.022, height: 0.062, proud: 0.008 };
const WINDOW = { halfWidth: 0.014, height: 0.03, proud: 0.006, x: 0.055 };
const FOOTING_SHADE = 0.85;
const RIDGE_SHADE = 0.8;
const WALL_JITTER = 0.05;
const WALL_JITTER_SEED = 0x4f2a;
const AO = { groundHeight: 0.035, groundStrength: 0.3, eaveReach: 0.03, eaveStrength: 0.4, concavity: 0.6 };

const ROOF_SLOPE = (HOUSE.ridge - HOUSE.eave) / (HOUSE.w / 2);
const ROOF_PITCH = Math.atan(ROOF_SLOPE);
/** The slab's thickness measured vertically. */
const SLAB_DROP = HOUSE_V2_ROOF_THICKNESS / Math.cos(ROOF_PITCH);
/** Where the roof's underside meets the wall: the walls stop here and the occlusion bake shades under it. */
export const HOUSE_V2_EAVE_UNDERSIDE = HOUSE.eave - SLAB_DROP;
/** The gable apex, where the two undersides and the slabs' inner faces meet. */
export const HOUSE_V2_GABLE_APEX = HOUSE.ridge - SLAB_DROP;
/**
 * A beam along the ridge, bevelled except underneath. Its bottom is where
 * the slab tops (which would meet at the ridge) reach its side planes, so it
 * rests on them; everything of the slabs above that line is inside it, and
 * its ends run square down to that line so the wedge caps meet them flush.
 */
export const HOUSE_V2_RIDGE_BEAM = { halfWidth: 0.02, bottom: HOUSE.ridge - 0.02 * ROOF_SLOPE, top: HOUSE.ridge + 0.008 };
/**
 * Between the two slabs' inner faces, under the beam, is a wedge of air
 * from the gable apex up to the beam's bottom; this is its half-width at
 * the top. A triangle at each end closes it.
 */
export const HOUSE_V2_WEDGE_HALF_WIDTH = (HOUSE_V2_RIDGE_BEAM.bottom - HOUSE_V2_GABLE_APEX) * Math.tan(ROOF_PITCH);
/**
 * Each slab starts this far along its own top from the ridge line, which
 * puts its inner bottom corner on the midline: the two slabs meet there
 * edge to edge instead of running through each other.
 */
const SLAB_START = HOUSE_V2_ROOF_THICKNESS * Math.tan(ROOF_PITCH);

export const HOUSE_V2_HEIGHT = HOUSE_V2_RIDGE_BEAM.top;
export const HOUSE_V2_HALF_DIAGONAL =
  Math.ceil(Math.hypot(HOUSE.w / 2 + HOUSE_V2_ROOF_OVERHANG, HOUSE.d / 2 + HOUSE_V2_ROOF_OVERHANG) * 200) / 200;
export const HOUSE_V2_TRIANGLE_BUDGET = 240;
/** What the build below comes to: footing 10, two wall bands 32, gables 2, two slabs 64, ridge beam 30, wedge caps 2, door 20, window 30. */
export const HOUSE_V2_TRIANGLES = 190;

/**
 * One roof slab as a closed bevelled box built lying flat (x out from the
 * ridge, y down through its thickness, z along the ridge), then tilted
 * about the ridge line to the roof's pitch. Its inner face is square (a
 * plain quad in place of the chamfered one), so the two slabs meet edge to
 * edge at the apex and the wedge caps can sit exactly between them.
 */
export function addHouseV2RoofSlab(b: FacetBuilder, side: -1 | 1, color: Rgb) {
  const ue = HOUSE.w / 2 + HOUSE_V2_ROOF_OVERHANG;
  const ye = HOUSE.eave - HOUSE_V2_ROOF_OVERHANG * ROOF_SLOPE;
  const length = Math.hypot(ue, HOUSE.ridge - ye);
  const halfV = HOUSE.d / 2 + HOUSE_V2_ROOF_OVERHANG;
  const from = b.vertexCount();
  const min: Vec3 = [side > 0 ? SLAB_START : -length, -HOUSE_V2_ROOF_THICKNESS, -halfV];
  const max: Vec3 = [side > 0 ? length : -SLAB_START, 0, halfV];
  b.bevelledBox(min, max, ROOF_BEVEL, color, side > 0 ? { left: false } : { right: false });
  const x = side * SLAB_START;
  const corners: Vec3[] = [
    [x, -HOUSE_V2_ROOF_THICKNESS, -halfV],
    [x, -HOUSE_V2_ROOF_THICKNESS, halfV],
    [x, 0, halfV],
    [x, 0, -halfV],
  ];
  // Wound to face the ridge: −x for the +x slab, +x for the −x slab.
  if (side > 0) b.quad(corners[0], corners[1], corners[2], corners[3], color);
  else b.quad(corners[3], corners[2], corners[1], corners[0], color);
  b.rotate(from, b.vertexCount(), "z", -side * ROOF_PITCH);
  b.translate(from, b.vertexCount(), [0, HOUSE.ridge, 0]);
}

/** Builds the notch-up house at scale 1. Colours are linear RGB in [0, 1]. */
export function buildHouseGeometryV2(colors: BuildingColors): FacetGeometryData {
  const b = createFacetBuilder();
  const hw = HOUSE.w / 2;
  const hd = HOUSE.d / 2;

  // Footing below ground, then bevelled walls up to the roof's underside,
  // square at both ends so they butt onto the footing and under the slabs.
  // Two stacked bands, so the vertex colours have a ring at the top of the
  // ground-contact shading: with one quad per wall the bake could only
  // tint the corners.
  b.box([-hw, -BUILDING_FOOTING, -hd], [hw, 0, hd], shadeRgb(colors.wall, FOOTING_SHADE), { top: false });
  const wallsFrom = b.vertexCount();
  const bands = [0, AO.groundHeight, HOUSE_V2_EAVE_UNDERSIDE];
  for (let i = 0; i < bands.length - 1; i++) {
    b.bevelledBox([-hw, bands[i], -hd], [hw, bands[i + 1], hd], WALL_BEVEL, colors.wall, { bottom: false, top: false });
  }
  // Gables fill the ends up to the undersides of the slabs, whose planes their edges lie in.
  b.triangle([-hw, HOUSE_V2_EAVE_UNDERSIDE, hd], [hw, HOUSE_V2_EAVE_UNDERSIDE, hd], [0, HOUSE_V2_GABLE_APEX, hd], colors.wall);
  b.triangle([-hw, HOUSE_V2_EAVE_UNDERSIDE, -hd], [0, HOUSE_V2_GABLE_APEX, -hd], [hw, HOUSE_V2_EAVE_UNDERSIDE, -hd], colors.wall);
  b.jitterColors(WALL_JITTER, WALL_JITTER_SEED, wallsFrom, b.vertexCount());

  addHouseV2RoofSlab(b, -1, colors.roof);
  addHouseV2RoofSlab(b, 1, colors.roof);
  const halfV = hd + HOUSE_V2_ROOF_OVERHANG;
  const beam = HOUSE_V2_RIDGE_BEAM;
  const beamColor = shadeRgb(colors.roof, RIDGE_SHADE);
  // Its bottom face would lie inside the slabs and over the closed wedge, so it is dropped: the ends run square down.
  b.bevelledBox([-beam.halfWidth, beam.bottom, -halfV], [beam.halfWidth, beam.top, halfV], ROOF_BEVEL, beamColor, { bottom: false });
  // The wedge caps: from the apex up to the beam's bottom edge, their slanted edges on the slabs' inner faces.
  const w = HOUSE_V2_WEDGE_HALF_WIDTH;
  b.triangle([0, HOUSE_V2_GABLE_APEX, halfV], [w, beam.bottom, halfV], [-w, beam.bottom, halfV], beamColor);
  b.triangle([0, HOUSE_V2_GABLE_APEX, -halfV], [-w, beam.bottom, -halfV], [w, beam.bottom, -halfV], beamColor);

  // Door and a window on the front, standing on the wall plane with their
  // backs open, bevelled on their proud faces.
  b.bevelledBox([-DOOR.halfWidth, 0, hd], [DOOR.halfWidth, DOOR.height, hd + DOOR.proud], FIXTURE_BEVEL, colors.timber, {
    back: false,
    bottom: false,
  });
  const windowTop = HOUSE_V2_EAVE_UNDERSIDE - WINDOW_EAVE_MARGIN;
  b.bevelledBox(
    [-WINDOW.x - WINDOW.halfWidth, windowTop - WINDOW.height, hd],
    [-WINDOW.x + WINDOW.halfWidth, windowTop, hd + WINDOW.proud],
    FIXTURE_BEVEL,
    colors.timber,
    { back: false }
  );

  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight,
    groundStrength: AO.groundStrength,
    concavityStrength: AO.concavity,
    centroid: [0, HOUSE.eave / 2, 0],
    overhangs: [{ y: HOUSE_V2_EAVE_UNDERSIDE, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
  return b.build();
}
