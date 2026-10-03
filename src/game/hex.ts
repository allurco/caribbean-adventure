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
