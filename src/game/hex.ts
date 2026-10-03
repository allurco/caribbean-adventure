export type Hex = { q: number; r: number; s: number };

export const hex = (q: number, r: number): Hex => ({ q, r, s: -q - r });

const NEIGHBOR_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export const neighbors = (h: Hex): Hex[] =>
  NEIGHBOR_DIRS.map(([dq, dr]) => hex(h.q + dq, h.r + dr));

export const hexEquals = (a: Hex, b: Hex): boolean =>
  a.q === b.q && a.r === b.r;

export const hexDistance = (a: Hex, b: Hex): number =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));

export const isAdjacent = (a: Hex, b: Hex): boolean =>
  hexDistance(a, b) === 1;

/**
 * East–west wrap of the map. Flat-top hexes stack in vertical columns of constant `q`,
 * so "east–west" is the `q` axis, and the map is a cylinder `columns` wide.
 *
 * Moving `columns` columns east on the same offset row is the cube translation
 * (q + columns, r - columns / 2). That is only a whole-hex translation when `columns`
 * is even, which is why an odd width is rejected. Canonical hexes have q in [0, columns).
 *
 * `null` means the map does not wrap, and every wrapped function then behaves like
 * its plain counterpart. The value is plain data, so it can live in `G`.
 */
export interface Wrap {
  readonly columns: number;
}
export type MapWrap = Wrap | null;

export const NO_WRAP: MapWrap = null;

/** Smallest width at which a hex's six neighbours stay distinct across the seam. */
const MIN_WRAP_COLUMNS = 4;

export const createWrap = (columns: number): Wrap => {
  if (!Number.isInteger(columns) || columns < MIN_WRAP_COLUMNS) {
    throw new Error(`Wrap width must be an integer of at least ${MIN_WRAP_COLUMNS} columns, got ${columns}`);
  }
  if (columns % 2 !== 0) {
    throw new Error(`Wrap width must be an even number of columns, got ${columns}`);
  }
  return { columns };
};

/** Shift a hex by `k` whole wraps east (negative k = west). `+ 0` turns -0 into 0. */
const shiftByWraps = (h: Hex, k: number, columns: number): Hex => {
  const q = h.q + k * columns;
  const r = h.r - (k * columns) / 2;
  return { q: q + 0, r: r + 0, s: -q - r + 0 };
};

/** The copy of `h` whose column lies in [0, columns). */
export const canonicalHex = (h: Hex, wrap: MapWrap): Hex => {
  if (!wrap) return h;
  const k = Math.floor(h.q / wrap.columns);
  return k === 0 ? h : shiftByWraps(h, -k, wrap.columns);
};

/**
 * The copy of `to` that is closest to `from` in unwrapped cube space (possibly outside
 * the canonical columns). Use it to measure, draw a line or animate across the seam.
 */
export const nearestImage = (from: Hex, to: Hex, wrap: MapWrap): Hex => {
  if (!wrap) return to;
  // Every term of the cube distance is minimised near k = (from.q - to.q) / columns,
  // and the distance is convex in k, so the best whole k is its floor or ceiling.
  const ideal = (from.q - to.q) / wrap.columns;
  const a = shiftByWraps(to, Math.floor(ideal), wrap.columns);
  const b = shiftByWraps(to, Math.ceil(ideal), wrap.columns);
  return hexDistance(from, b) < hexDistance(from, a) ? b : a;
};

export const wrappedNeighbors = (h: Hex, wrap: MapWrap): Hex[] =>
  neighbors(h).map((n) => canonicalHex(n, wrap));

/** Hex distance going the shorter way round the seam. */
export const wrappedDistance = (a: Hex, b: Hex, wrap: MapWrap): number =>
  hexDistance(a, nearestImage(a, b, wrap));

export const wrappedEquals = (a: Hex, b: Hex, wrap: MapWrap): boolean =>
  hexEquals(canonicalHex(a, wrap), canonicalHex(b, wrap));

/** World-space X distance of one full wrap (Z does not change). Infinity with no wrap. */
export const wrapWorldWidth = (wrap: MapWrap): number =>
  wrap ? SIZE * (3 / 2) * wrap.columns : Infinity;

/** Flat-top "odd-q" offset coordinates: odd columns sit half a hex lower. */
export const hexToOffset = (h: Hex): { col: number; row: number } => ({
  col: h.q,
  row: h.r + Math.floor(h.q / 2),
});

export const offsetToHex = (col: number, row: number): Hex =>
  hex(col, row - Math.floor(col / 2));

/** A rectangular map `columns` wide and `rows` tall, in canonical columns 0..columns-1. */
export const hexRect = (columns: number, rows: number): Hex[] => {
  const cells: Hex[] = [];
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      cells.push(offsetToHex(col, row));
    }
  }
  return cells;
};

/** Generate a hex grid ring-by-ring out to `radius`. */
export const hexGrid = (radius: number): Hex[] => {
  const cells: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      cells.push(hex(q, r));
    }
  }
  return cells;
};

const SIZE = 1;
const SQRT3 = Math.sqrt(3);

/** Flat-top hex -> world XZ position (Y is up). */
export const hexToWorld = (h: Hex): [number, number, number] => [
  SIZE * (3 / 2) * h.q,
  0,
  SIZE * ((SQRT3 / 2) * h.q + SQRT3 * h.r),
];

/** World XZ position -> the flat-top hex containing it (inverse of hexToWorld, cube-rounded). */
export const worldToHex = (x: number, z: number): Hex => {
  const qf = ((2 / 3) * x) / SIZE;
  const rf = (z / SQRT3 - x / 3) / SIZE;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return hex(q, r);
};
