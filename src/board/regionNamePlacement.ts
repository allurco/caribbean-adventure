import type { MapWrap } from "../game/hex";
import { canonicalHex, hexToOffset, hexToWorld, worldToHex, wrapWorldWidth, wrappedNeighbors } from "../game/hex";
import type { MapCell, Region, RegionId } from "../game/types";

/**
 * Where each region's name is written into the sea (#239), pure: like the
 * names on an old sea chart, laid along the region's largest stretch of
 * open water, clear of land, reefs and the ports' name labels. The chart
 * texture (`regionChartTexture.ts`) draws what this picks, and the ocean
 * shader writes it into the water.
 *
 * The search tries sizes from `REGION_NAME_MAX_SIZE` down: first the name on
 * one line, down to `REGION_NAME_SPLIT_SIZE`, then split onto two lines, down
 * to `REGION_NAME_MIN_SIZE`, then on one line once more at the smallest
 * sizes. At each size it tries the region's water from the most open
 * (furthest in hex steps from anything a letter may not cover), then the
 * nearest the region's middle, and, there, the flattest angle first, so a name only turns where it has to, following
 * a long diagonal stretch of water as chart lettering does. The whole search
 * keeps off the map's outer rows (`REGION_NAME_RIM_ROWS`) first, so a name
 * lies across its region's sea rather than along the board's edge, and only
 * where no size fits inside does it use them. A region with no
 * room even at the smallest size is not named on the sea (its tooltip still
 * names it).
 */

/** Largest letter size (the font's em) in world units: a hex is 2 across. */
export const REGION_NAME_MAX_SIZE = 0.9;
/** Below this a long name goes onto two lines before it shrinks further. */
export const REGION_NAME_SPLIT_SIZE = 0.5;
/** Smallest letter size: about 10 px on screen at the overview's distance. */
export const REGION_NAME_MIN_SIZE = 0.32;
/**
 * The average advance of an IM Fell English SC capital, in ems, a little
 * over the font's own (about 0.68), so the drawn name fits the box the
 * placement checked; the chart texture condenses it to the box if not.
 */
export const REGION_NAME_ADVANCE = 0.72;
/** The extra space between letters, in ems: chart lettering is spaced wide. */
export const REGION_NAME_LETTER_SPACING = 0.15;
/** Baseline-to-baseline distance of a two-line name, in ems. */
export const REGION_NAME_LINE_HEIGHT = 1.15;
/** Water kept clear round the text block, world units: past the coast's noise (0.25) with room to spare. */
export const REGION_NAME_MARGIN = 0.5;
/** The steepest a name turns from level, radians: past this it stops reading as a level line. */
export const REGION_NAME_MAX_ANGLE = Math.PI / 6;

/** Rows (and, on a map that does not wrap, columns) along the map's edge a name keeps off while it can. */
export const REGION_NAME_RIM_ROWS = 2;

const SIZE_STEP = 0.05;
const ANGLES = [0, 1, -1, 2, -2, 3, -3].map((k) => (k * REGION_NAME_MAX_ANGLE) / 3);
/** Sampling step over the checked block, world units: a hex is 2 across, so nothing hex-sized slips between. */
const SAMPLE_STEP = 0.2;

/** A region's name as written into the sea. */
export interface RegionNamePlacement {
  region: RegionId;
  /** The name in capitals, on one line or two. */
  lines: string[];
  /** Centre of the text block, world XZ. */
  x: number;
  z: number;
  /**
   * The baseline's turn from due east, radians, towards +z (south, the
   * screen's bottom): the baseline runs along (cos angle, sin angle) in XZ.
   */
  angle: number;
  /** Letter size (the font's em), world units. */
  size: number;
  /** The widest line's length, world units. */
  width: number;
  /** The block's height, world units: `size` per line plus the gap between. */
  height: number;
}

/** A port's name label floating over its town reads, seen down the camera's pitch, over the hexes north of it. */
interface KeepOut {
  x: number;
  minZ: number;
  maxZ: number;
  halfWidth: number;
}
/** How far a port's label reaches north of the port's centre, seen at the overview's pitch, and south. */
const PORT_LABEL_NORTH = 2.4;
const PORT_LABEL_SOUTH = 0.8;
/** Half the label's width on the sea: a margin plus about 0.13 units a letter at the overview. */
const portLabelHalfWidth = (name: string) => Math.max(1.6, 0.4 + 0.13 * name.length);

/** The length of one line of `text` at letter `size`. */
export function regionNameLineWidth(text: string, size: number): number {
  const n = text.length;
  return size * (n * REGION_NAME_ADVANCE + Math.max(0, n - 1) * REGION_NAME_LETTER_SPACING);
}

/** The text block's four corners in world XZ: top-left, top-right, bottom-right, bottom-left as read. */
export function regionNameFootprint(p: RegionNamePlacement, margin = 0): [number, number][] {
  const ux = Math.cos(p.angle);
  const uz = Math.sin(p.angle);
  // "Up" on the letters: north at angle 0
  const vx = uz;
  const vz = -ux;
  const hw = p.width / 2 + margin;
  const hh = p.height / 2 + margin;
  const at = (s: number, t: number): [number, number] => [p.x + ux * s + vx * t, p.z + uz * s + vz * t];
  return [at(-hw, hh), at(hw, hh), at(hw, -hh), at(-hw, -hh)];
}

/** The name on one line, or split at the space that best balances two. */
function layouts(name: string): { one: string[]; two: string[] | null } {
  const text = name.toUpperCase();
  const words = text.split(" ");
  let two: string[] | null = null;
  let longest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const l = Math.max(lines[0].length, lines[1].length);
    if (l < longest) {
      longest = l;
      two = lines;
    }
  }
  return { one: [text], two };
}

function sizesFrom(max: number, min: number): number[] {
  const sizes: number[] = [];
  for (let s = max; s >= min - 1e-9; s -= SIZE_STEP) sizes.push(Math.round(s * 100) / 100);
  return sizes;
}

/** One name per region that has room for it, in region order. */
export function placeRegionNames(cells: readonly MapCell[], regions: readonly Region[], wrap: MapWrap): RegionNamePlacement[] {
  const key = (q: number, r: number) => q * 65536 + r;
  const byKey = new Map(cells.map((c) => [key(c.hex.q, c.hex.r), c]));
  const period = wrap ? wrapWorldWidth(wrap) : 0;
  const keepOuts: KeepOut[] = cells
    .filter((c) => c.hasPort)
    .map((c) => {
      const [x, , z] = hexToWorld(c.hex);
      return { x, minZ: z - PORT_LABEL_NORTH, maxZ: z + PORT_LABEL_SOUTH, halfWidth: portLabelHalfWidth(c.portName ?? "") };
    });
  const underLabel = (x: number, z: number) =>
    keepOuts.some((k) => {
      let d = x - k.x;
      if (period) d -= period * Math.round(d / period);
      return Math.abs(d) < k.halfWidth && z > k.minZ && z < k.maxZ;
    });

  let lastRow = 0;
  let lastCol = 0;
  for (const c of cells) {
    const { col, row } = hexToOffset(c.hex);
    lastRow = Math.max(lastRow, row);
    lastCol = Math.max(lastCol, col);
  }
  const inside = (c: MapCell) => {
    const { col, row } = hexToOffset(c.hex);
    const rows = row >= REGION_NAME_RIM_ROWS && row <= lastRow - REGION_NAME_RIM_ROWS;
    return rows && (wrap !== null || (col >= REGION_NAME_RIM_ROWS && col <= lastCol - REGION_NAME_RIM_ROWS));
  };

  return regions.flatMap((region) => {
    for (const keepOffRim of [true, false]) {
      const placed = placeName(region, (c) => c !== undefined && c.region === region.id && c.terrain === "water" && (!keepOffRim || inside(c)));
      if (placed) return [placed];
    }
    return [];
  });

  function placeName(region: Region, writable: (c: MapCell | undefined) => boolean): RegionNamePlacement | null {
    const cellAt = (x: number, z: number) => {
      const h = canonicalHex(worldToHex(x, z), wrap);
      return byKey.get(key(h.q, h.r));
    };
    const fits = (p: RegionNamePlacement) => {
      const [a, b, , d] = regionNameFootprint(p, REGION_NAME_MARGIN);
      const along = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_STEP);
      const across = Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / SAMPLE_STEP);
      // The rim first: a block that fails, fails there
      for (const pass of [0, 1]) {
        for (let i = 0; i <= along; i++) {
          for (let j = 0; j <= across; j++) {
            const rim = i === 0 || j === 0 || i === along || j === across;
            if (rim !== (pass === 0)) continue;
            const s = i / along;
            const t = j / across;
            const x = a[0] + (b[0] - a[0]) * s + (d[0] - a[0]) * t;
            const z = a[1] + (b[1] - a[1]) * s + (d[1] - a[1]) * t;
            if (!writable(cellAt(x, z)) || underLabel(x, z)) return false;
          }
        }
      }
      return true;
    };

    // The region's open water, most open first: hex steps to anything not writable
    const own = cells.filter(writable);
    if (own.length === 0) return null;
    const openness = new Map<number, number>();
    let frontier = own.filter((c) =>
      wrappedNeighbors(c.hex, wrap).some((n) => !writable(byKey.get(key(n.q, n.r))))
    );
    for (const c of frontier) openness.set(key(c.hex.q, c.hex.r), 0);
    for (let step = 1; frontier.length > 0; step++) {
      const next: MapCell[] = [];
      for (const c of frontier) {
        for (const n of wrappedNeighbors(c.hex, wrap)) {
          const k = key(n.q, n.r);
          const cell = byKey.get(k);
          if (!writable(cell) || openness.has(k)) continue;
          openness.set(k, step);
          next.push(cell!);
        }
      }
      frontier = next;
    }
    const middle = middleOf(own.map((c) => hexToWorld(c.hex)), period);
    const fromMiddle = (x: number, z: number) => {
      let d = x - middle.x;
      if (period) d -= period * Math.round(d / period);
      return Math.hypot(d, z - middle.z);
    };
    const centres = own
      .map((c) => {
        const [x, , z] = hexToWorld(c.hex);
        return { x, z, open: openness.get(key(c.hex.q, c.hex.r)) ?? Infinity, far: fromMiddle(x, z) };
      })
      .sort((a, b) => b.open - a.open || a.far - b.far || a.z - b.z || a.x - b.x);

    const { one, two } = layouts(region.name);
    const tries: { lines: string[]; size: number }[] = [
      ...sizesFrom(REGION_NAME_MAX_SIZE, REGION_NAME_SPLIT_SIZE).map((size) => ({ lines: one, size })),
      ...(two ? sizesFrom(REGION_NAME_MAX_SIZE, REGION_NAME_MIN_SIZE).map((size) => ({ lines: two, size })) : []),
      ...sizesFrom(REGION_NAME_SPLIT_SIZE - SIZE_STEP, REGION_NAME_MIN_SIZE).map((size) => ({ lines: one, size })),
    ];
    for (const { lines, size } of tries) {
      const width = Math.max(...lines.map((l) => regionNameLineWidth(l, size)));
      const height = size * (1 + (lines.length - 1) * REGION_NAME_LINE_HEIGHT);
      // A centre needs at least half the block's height of open water round it
      const needed = Math.max(0, Math.floor((height / 2 + REGION_NAME_MARGIN) / Math.sqrt(3)) - 1);
      for (const c of centres) {
        if (c.open < needed) break;
        for (const angle of ANGLES) {
          const p: RegionNamePlacement = { region: region.id, lines, x: c.x, z: c.z, angle, size, width, height };
          if (fits(p)) return p;
        }
      }
    }
    return null;
  }
}

/** The middle of some world points in XZ, x as a mean round the cylinder when the map wraps (`period` > 0). */
function middleOf(points: readonly [number, number, number][], period: number): { x: number; z: number } {
  let x = 0;
  let z = 0;
  let sin = 0;
  let cos = 0;
  for (const [px, , pz] of points) {
    x += px;
    z += pz;
    sin += Math.sin((px / (period || 1)) * Math.PI * 2);
    cos += Math.cos((px / (period || 1)) * Math.PI * 2);
  }
  const n = Math.max(1, points.length);
  if (!period) return { x: x / n, z: z / n };
  return { x: ((Math.atan2(sin, cos) / (Math.PI * 2)) * period + period) % period, z: z / n };
}
