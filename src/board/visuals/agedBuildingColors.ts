/**
 * The aged settlement's colours (#59), shared by the board
 * (`PortBuildings.tsx`) and the prop viewer: lime render under weathered
 * terracotta, salt-greyed timber, rough stone for the tower, near-black
 * iron. The warehouse is timber-walled, a shade lighter than its fittings.
 * The church is whitewashed a coat fresher than the houses (warm, never a
 * clean cool white), its quoins and door surround a grey-ochre stone, its
 * bells a dark bronze.
 */
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import type { BuildingKind } from "./buildingGeometry";
import type { AgedColors } from "./agedKit";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};

/** The quoin stone against the tower's grey-brown blocks: a touch warmer and more ochre. */
const CHURCH_STONE_TINT: Rgb = [1.02, 0.97, 0.86];

export function agedBuildingColors(kind: BuildingKind): AgedColors {
  const timber = rgb("oldTimber");
  const stone = rgb("roughStone");
  const base: AgedColors = { wall: rgb("limewash"), roof: rgb("oldTerracotta"), timber, stone, iron: rgb("ironwork"), bronze: rgb("bellBronze") };
  if (kind === "warehouse") return { ...base, wall: [timber[0] * 1.4, timber[1] * 1.4, timber[2] * 1.4] };
  if (kind === "church") {
    return { ...base, wall: rgb("churchLime"), stone: [stone[0] * CHURCH_STONE_TINT[0], stone[1] * CHURCH_STONE_TINT[1], stone[2] * CHURCH_STONE_TINT[2]] };
  }
  return base;
}
