/**
 * The flag over a port's watchtower (issue #59). Pure, no Three.js.
 *
 * A small faceted rectangle flying from the pole top, two sided, with a
 * ripple down its length so the flat facets catch the light. It is a 3 × 3
 * grid of cells, each in one of the nation's colours: the same bands the
 * HUD's `NationFlag` draws (St George's cross, the tricolore, the
 * rojigualda, the Prinsenvlag, a black field with a pale centre for the
 * pirate haven). The colours are authored in sRGB like the palette and
 * converted here so the module stays free of three.
 *
 * Local space is the tower's: the hoist (the pole top) is given, the fly
 * runs along +x. A port's flag is drawn as its own instanced mesh per
 * nation, sharing the tower's instance matrices (`PortBuildings.tsx`).
 */
import type { PortNation } from "../../game/types";
import { createFacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

export const FLAG_WIDTH = 0.1;
export const FLAG_HEIGHT = 0.055;
/** Ripple amplitude across the fly, world units. */
export const FLAG_RIPPLE = 0.004;
/** Nine cells, two triangles each, both sides. */
export const FLAG_TRIANGLES = 36;

/** The HUD's flag colours (Tailwind red-600, blue-700, yellow-500, orange-500, blue-600; an off-white; gray-900). */
export const FLAG_HEX = {
  red: 0xdc2626,
  frenchBlue: 0x1d4ed8,
  yellow: 0xeab308,
  orange: 0xf97316,
  dutchBlue: 0x2563eb,
  white: 0xf4f1ea,
  black: 0x111827,
} as const;

type FlagColorName = keyof typeof FLAG_HEX;

/** Rows top to bottom, cells left (hoist) to right (fly). */
export type FlagCells = readonly [readonly [FlagColorName, FlagColorName, FlagColorName], readonly [FlagColorName, FlagColorName, FlagColorName], readonly [FlagColorName, FlagColorName, FlagColorName]];

const rows = (top: FlagColorName, middle: FlagColorName, bottom: FlagColorName): FlagCells => [
  [top, top, top],
  [middle, middle, middle],
  [bottom, bottom, bottom],
];
const columns = (hoist: FlagColorName, middle: FlagColorName, fly: FlagColorName): FlagCells => [
  [hoist, middle, fly],
  [hoist, middle, fly],
  [hoist, middle, fly],
];

export const NATION_FLAG_CELLS: Readonly<Record<PortNation, FlagCells>> = {
  England: [
    ["white", "red", "white"],
    ["red", "red", "red"],
    ["white", "red", "white"],
  ],
  France: columns("frenchBlue", "white", "red"),
  Spain: rows("red", "yellow", "red"),
  Netherlands: rows("orange", "white", "dutchBlue"),
  Pirate: [
    ["black", "black", "black"],
    ["black", "white", "black"],
    ["black", "black", "black"],
  ],
};

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** A flag colour as linear RGB, as three's colour management would convert the hex. */
export function flagRgb(name: FlagColorName): Rgb {
  const hex = FLAG_HEX[name];
  return [srgbToLinear(((hex >> 16) & 0xff) / 255), srgbToLinear(((hex >> 8) & 0xff) / 255), srgbToLinear((hex & 0xff) / 255)];
}

/** Ripple offset in z at a fraction `u` of the fly. */
const ripple = (u: number) => FLAG_RIPPLE * Math.sin(u * Math.PI * 1.5);

/**
 * Builds a nation's flag with its hoist's top corner at `hoist`, flying
 * along +x and hanging down from there.
 */
export function buildNationFlagGeometry(nation: PortNation, hoist: Vec3): FacetGeometryData {
  const b = createFacetBuilder();
  const cells = NATION_FLAG_CELLS[nation];
  const at = (col: number, row: number): Vec3 => {
    const u = col / 3;
    return [hoist[0] + FLAG_WIDTH * u, hoist[1] - (FLAG_HEIGHT * row) / 3, hoist[2] + ripple(u)];
  };
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const color = flagRgb(cells[row][col]);
      const a = at(col, row + 1);
      const bq = at(col + 1, row + 1);
      const c = at(col + 1, row);
      const d = at(col, row);
      // Both sides: the same two triangles wound each way.
      b.triangle(a, bq, c, color);
      b.triangle(a, c, d, color);
      b.triangle(a, c, bq, color);
      b.triangle(a, d, c, color);
    }
  }
  return b.build();
}
