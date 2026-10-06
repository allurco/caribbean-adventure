/**
 * What the prop viewer (`PropViewer.tsx`, `?view=props`) shows, issue #59.
 * Pure: builders and colours only, no React. Later slices add kit pieces
 * to `PROP_ENTRIES`.
 */
import { paletteColor, type PaletteName } from "./visuals/palette";
import type { Rgb } from "./visuals/palmGeometry";
import { buildRockGeometry } from "./visuals/rockGeometry";
import { buildRockGeometryV2 } from "./visuals/rockGeometryV2";
import { ROCK_BASE_COLOR, ROCK_SIZE_CLASS_SCALE } from "./visuals/rockVariation";
import { buildBuildingGeometry, type BuildingColors } from "./visuals/buildingGeometry";
import { buildHouseGeometryV2 } from "./visuals/buildingGeometryV2";
import { buildQuayGeometry, type QuayColors } from "./visuals/quayGeometry";

/** Any prop builder's output; `colors` is optional (the faceted rock has none and draws white). */
export interface PropGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  colors?: Float32Array;
  vertexCount: number;
}

export interface PropEntry {
  label: string;
  build: () => PropGeometryData;
  /** sRGB hex, multiplied with the vertex colours (the instance colour's role in the game). */
  color: number;
  scale?: number;
  roughness?: number;
}

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/** The house's palette, as `PortBuildings.tsx` picks it. */
const HOUSE_COLORS: BuildingColors = { wall: rgb("whitewash"), roof: rgb("timber"), timber: rgb("timber"), stone: rgb("masonry") };

/** The quay's palette, as `Quays.tsx` picks it: weathered masonry, near-black mortar, timber, iron, rope and the beach sand. */
const QUAY_COLORS: QuayColors = (() => {
  const masonry = rgb("masonry");
  const stone: [number, number, number] = [masonry[0] * 0.95, masonry[1] * 0.86, masonry[2] * 0.72];
  return {
    stone,
    mortar: [stone[0] * 0.28, stone[1] * 0.26, stone[2] * 0.24],
    timber: rgb("timber"),
    iron: [0.045, 0.04, 0.038],
    rope: [0.42, 0.34, 0.22],
    sand: rgb("drySand"),
  };
})();

/** A medium (grass) rock, the commonest size class; the boulder variant. */
const ROCK_SCALE = ROCK_SIZE_CLASS_SCALE.medium;
const ROCK_VARIANT = 0;

export const PROP_ENTRIES: readonly PropEntry[] = [
  { label: "rock, faceted", build: () => buildRockGeometry(ROCK_VARIANT), color: ROCK_BASE_COLOR.SAND, scale: ROCK_SCALE, roughness: 0.95 },
  { label: "rock, notch up", build: () => buildRockGeometryV2(ROCK_VARIANT), color: ROCK_BASE_COLOR.SAND, scale: ROCK_SCALE, roughness: 0.95 },
  { label: "house, faceted", build: () => buildBuildingGeometry("house", HOUSE_COLORS), color: 0xffffff, roughness: 0.9 },
  { label: "house, notch up", build: () => buildHouseGeometryV2(HOUSE_COLORS), color: 0xffffff, roughness: 0.9 },
  { label: "quay, notch up", build: () => buildQuayGeometry(QUAY_COLORS), color: 0xffffff, roughness: 0.95 },
];
