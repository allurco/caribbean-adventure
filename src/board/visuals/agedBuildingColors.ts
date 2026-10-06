/**
 * The aged settlement's colours (#59), shared by the board
 * (`PortBuildings.tsx`) and the prop viewer: lime render under weathered
 * terracotta, salt-greyed timber, rough stone for the tower, near-black
 * iron. The warehouse is timber-walled, a shade lighter than its fittings.
 */
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import type { BuildingKind } from "./buildingGeometry";
import type { AgedColors } from "./agedKit";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

export function agedBuildingColors(kind: BuildingKind): AgedColors {
  const timber = rgb("oldTimber");
  const base: AgedColors = { wall: rgb("limewash"), roof: rgb("oldTerracotta"), timber, stone: rgb("roughStone"), iron: rgb("ironwork") };
  if (kind === "warehouse") return { ...base, wall: [timber[0] * 1.4, timber[1] * 1.4, timber[2] * 1.4] };
  return base;
}
