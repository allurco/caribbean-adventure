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
 * Feature sizes are chosen for ship zoom (camera 3.5–4.3 units off): a
 * 0.01 bevel is about two pixels there, a 0.02 roof edge about five.
 */
import { BUILDING_FOOTING, type BuildingColors } from "./buildingGeometry";
import { createFacetBuilder, shadeRgb, type FacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

/** The faceted house's footprint and heights (`GABLED.house` in buildingGeometry.ts). */
const HOUSE = { w: 0.18, d: 0.14, eave: 0.1, ridge: 0.19 };

export const HOUSE_V2_ROOF_THICKNESS = 0.02;
export const HOUSE_V2_ROOF_OVERHANG = 0.025;
/** A beam along the ridge hides where the two slabs meet and gives the roofline a lip. */
const RIDGE_CAP = { halfWidth: 0.016, below: 0.016, above: 0.008 };
const WALL_BEVEL = 0.01;
const ROOF_BEVEL = 0.006;
const FIXTURE_BEVEL = 0.003;
const DOOR = { halfWidth: 0.022, height: 0.062, proud: 0.008 };
const WINDOW = { halfWidth: 0.014, bottom: 0.045, top: 0.075, proud: 0.006, x: 0.055 };
const FOOTING_SHADE = 0.85;
const RIDGE_SHADE = 0.8;
const WALL_JITTER = 0.05;
const WALL_JITTER_SEED = 0x4f2a;
const AO = { groundHeight: 0.035, groundStrength: 0.3, eaveReach: 0.03, eaveStrength: 0.4, concavity: 0.6 };

export const HOUSE_V2_HEIGHT = HOUSE.ridge + RIDGE_CAP.above;
export const HOUSE_V2_HALF_DIAGONAL =
  Math.ceil(Math.hypot(HOUSE.w / 2 + HOUSE_V2_ROOF_OVERHANG, HOUSE.d / 2 + HOUSE_V2_ROOF_OVERHANG) * 200) / 200;
export const HOUSE_V2_TRIANGLE_BUDGET = 240;
/** What the build below comes to: footing 10, three wall bands 48, gables 2, two slabs 60, ridge beam 44, door 20, window 30. */
export const HOUSE_V2_TRIANGLES = 214;

const ROOF_SLOPE = (HOUSE.ridge - HOUSE.eave) / (HOUSE.w / 2);
/** Where the roof slab's underside meets the wall: the eave ledge the occlusion bake shades under. */
const EAVE_UNDERSIDE = HOUSE.eave - HOUSE_V2_ROOF_THICKNESS / Math.cos(Math.atan(ROOF_SLOPE));

/**
 * One roof slab as a bevelled box built lying flat (x out from the ridge,
 * y down through its thickness, z along the ridge), then tilted about the
 * ridge line to the roof's pitch. The ridge end is square so the two slabs
 * meet without a groove.
 */
function addRoofSlab(b: FacetBuilder, side: -1 | 1, color: Rgb) {
  const slope = ROOF_SLOPE;
  const ue = HOUSE.w / 2 + HOUSE_V2_ROOF_OVERHANG;
  const ye = HOUSE.eave - HOUSE_V2_ROOF_OVERHANG * slope;
  const length = Math.hypot(ue, HOUSE.ridge - ye);
  const halfV = HOUSE.d / 2 + HOUSE_V2_ROOF_OVERHANG;
  const from = b.vertexCount();
  const min: Vec3 = [side > 0 ? 0 : -length, -HOUSE_V2_ROOF_THICKNESS, -halfV];
  const max: Vec3 = [side > 0 ? length : 0, 0, halfV];
  b.bevelledBox(min, max, ROOF_BEVEL, color, side > 0 ? { left: false } : { right: false });
  b.rotate(from, b.vertexCount(), "z", -side * Math.atan(slope));
  b.translate(from, b.vertexCount(), [0, HOUSE.ridge, 0]);
}

/** Builds the notch-up house at scale 1. Colours are linear RGB in [0, 1]. */
export function buildHouseGeometryV2(colors: BuildingColors): FacetGeometryData {
  const b = createFacetBuilder();
  const hw = HOUSE.w / 2;
  const hd = HOUSE.d / 2;

  // Footing below ground, then bevelled walls up to the eaves, square at
  // both ends so they butt onto the footing and under the roof. The walls
  // are three stacked bands so the vertex colours have a ring at the top
  // of the ground-contact shading and one at the eave ledge: with a single
  // quad per wall the bake could only tint the corners.
  b.box([-hw, -BUILDING_FOOTING, -hd], [hw, 0, hd], shadeRgb(colors.wall, FOOTING_SHADE), { top: false });
  const wallsFrom = b.vertexCount();
  const bands = [0, AO.groundHeight, EAVE_UNDERSIDE, HOUSE.eave];
  for (let i = 0; i < bands.length - 1; i++) {
    b.bevelledBox([-hw, bands[i], -hd], [hw, bands[i + 1], hd], WALL_BEVEL, colors.wall, { bottom: false, top: false });
  }
  b.triangle([-hw, HOUSE.eave, hd], [hw, HOUSE.eave, hd], [0, HOUSE.ridge, hd], colors.wall);
  b.triangle([-hw, HOUSE.eave, -hd], [0, HOUSE.ridge, -hd], [hw, HOUSE.eave, -hd], colors.wall);
  b.jitterColors(WALL_JITTER, WALL_JITTER_SEED, wallsFrom, b.vertexCount());

  addRoofSlab(b, -1, colors.roof);
  addRoofSlab(b, 1, colors.roof);
  const halfV = hd + HOUSE_V2_ROOF_OVERHANG;
  b.bevelledBox(
    [-RIDGE_CAP.halfWidth, HOUSE.ridge - RIDGE_CAP.below, -halfV],
    [RIDGE_CAP.halfWidth, HOUSE.ridge + RIDGE_CAP.above, halfV],
    ROOF_BEVEL,
    shadeRgb(colors.roof, RIDGE_SHADE)
  );

  // Door and a window on the front, bevelled on their proud faces, square where they meet the wall.
  b.bevelledBox([-DOOR.halfWidth, 0, hd - DOOR.proud], [DOOR.halfWidth, DOOR.height, hd + DOOR.proud], FIXTURE_BEVEL, colors.timber, {
    back: false,
    bottom: false,
  });
  b.bevelledBox(
    [-WINDOW.x - WINDOW.halfWidth, WINDOW.bottom, hd - WINDOW.proud],
    [-WINDOW.x + WINDOW.halfWidth, WINDOW.top, hd + WINDOW.proud],
    FIXTURE_BEVEL,
    colors.timber,
    { back: false }
  );

  b.bakeAmbientOcclusion({
    groundHeight: AO.groundHeight,
    groundStrength: AO.groundStrength,
    concavityStrength: AO.concavity,
    centroid: [0, HOUSE.eave / 2, 0],
    overhangs: [{ y: EAVE_UNDERSIDE, reach: AO.eaveReach, strength: AO.eaveStrength }],
  });
  return b.build();
}
