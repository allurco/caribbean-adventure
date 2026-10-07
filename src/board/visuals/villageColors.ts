/**
 * The village's colours (#87), linear RGB from the shared
 * palette: the aged kit's lime, tile, timber and stone, with the stone
 * house in its rough grey-brown, the merchant's house in an ochre lime, the
 * lean-to and warehouse in bleached plank; the clutter's weathered timber,
 * faded cloths and tarred hulls; the ground works' coral-limestone walls.
 */
import { paletteColor, type PaletteName } from "./palette";
import type { Rgb } from "./palmGeometry";
import type { AgedColors } from "./agedKit";
import { agedBuildingColors } from "./agedBuildingColors";
import type { VillageVariant } from "./villageBuildingGeometry";
import type { TownPieceColors } from "./townPieces";

const rgb = (name: PaletteName): Rgb => {
  const c = paletteColor(name);
  return [c.r, c.g, c.b];
};
const mul = (c: Rgb, k: Rgb): Rgb => [Math.min(1, c[0] * k[0]), Math.min(1, c[1] * k[1]), Math.min(1, c[2] * k[2])];
/** sRGB hex to linear RGB, for the few colours the palette has no entry for. */
const hex = (h: number): Rgb => {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [toLinear((h >> 16) & 255), toLinear((h >> 8) & 255), toLinear(h & 255)];
};

export function villageColors(variant: VillageVariant): AgedColors {
  const house = agedBuildingColors("house");
  switch (variant) {
    case "cottage":
      return house;
    case "stoneHouse":
      return { ...house, wall: mul(rgb("roughStone"), [0.92, 0.9, 0.86]), stone: mul(rgb("roughStone"), [1.05, 1.02, 0.95]) };
    case "merchant":
      return { ...house, wall: mul(rgb("limewash"), [1.0, 0.86, 0.62]) };
    case "leanTo":
    case "warehouse":
      return { ...house, wall: rgb("bleachedPlank") };
  }
}

export function townPieceColors(): TownPieceColors {
  return {
    timber: rgb("bleachedPlank"),
    darkTimber: rgb("oldTimber"),
    iron: rgb("ironwork"),
    stone: mul(rgb("roughStone"), [1.1, 1.08, 1.02]),
    // Madder red, ochre, faded indigo: dyes a Caribbean market had.
    cloths: [hex(0x9c3b2a), hex(0xc0913a), hex(0x4a5a78)],
    strakes: [hex(0x2f5d6e), hex(0x8a3324), hex(0x4f6b3a)],
    tar: hex(0x2a221c),
    soil: hex(0x4a3524),
    leaf: hex(0x4f7a2e),
    frond: rgb("palmFrond"),
    trunk: rgb("palmTrunk"),
    water: hex(0x3d6e74),
    net: hex(0x6b5d4b),
    goods: [hex(0xc8702a), hex(0x9a8a3a), hex(0x7a2e2a), hex(0xd8c8a0)],
  };
}
