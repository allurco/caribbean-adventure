/**
 * The sea's mesh (#38 step 8): a camera-centred grid of concentric
 * level-of-detail rings, snapped to its own cells, that the water's vertex
 * stage displaces by the wave cascades (waveDisplacement.ts). Pure maths and
 * geometry; Ocean.tsx wraps the rings in meshes.
 *
 * Rings. The innermost ring is a square grid of OCEAN_GRID_BASE_CELL cells
 * (0.1 units, 6.5 m: about one texel of the swell cascade, so the swell is
 * carried at full detail at ship zoom); each ring outside it is an annulus
 * twice as wide with twice the cell. The outermost reaches past the sea the
 * camera can see at full zoom-out on the widest screen (`oceanGridReach`),
 * with the snapping margin to spare, so no edge is ever on screen; the
 * innermost covers the view at the closest ship zoom. Every vertex position
 * is an integer number of base cells, converted once, so a vertex two rings
 * share is the same float in both.
 *
 * Stitching. Where a ring meets the finer ring inside it, its edge cells
 * are split so the finer ring's boundary vertices are its own vertices too
 * (a fan from the cell's far corner through the inserted points): no
 * T-junctions, so the displaced mesh has no cracks. The shared vertices
 * carry the finer ring's cell in the `gridCell` attribute, so both rings
 * sample the displacement for them identically (waveDisplacement.ts).
 *
 * Snapping. The whole grid follows the camera focus, moved only in whole
 * multiples of the coarsest ring's cell (`oceanGridSnapCell`). Every finer
 * cell divides it, so after a move each ring's vertices land on the same
 * world lattice they left: the displacement is sampled at the same world
 * points before and after, and nothing swims when the camera pans. Each
 * ring is therefore built half a coarse cell larger than it needs to be.
 *
 * All shading is in world space (the cascades, the terrain field, the
 * seabed prepass), so moving the grid changes no pixel, and on a wrapping
 * map the one grid serves every copy of the world as the one plane did.
 */
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_PITCH, MAX_VIEW_ASPECT, groundViewReach } from "../cameraBounds";

/** World units per base cell: the innermost ring's cell. */
export const OCEAN_GRID_BASE_CELL = 0.1;

export interface OceanGridRing {
  /** Half-side of the ring's outer square, in base cells. */
  halfSize: number;
  /** Cell size, in base cells; a multiple of the ring inside's. */
  cell: number;
}

/**
 * The rings, innermost first: 8 units of 0.1-unit cells, then 16 / 0.2,
 * 32 / 0.4, 64 / 0.8 and 96 / 1.6. About 95k vertices in all; at ship zoom
 * only the first ring or two are in view and the rest are culled.
 */
export const OCEAN_GRID_RINGS: readonly OceanGridRing[] = [
  { halfSize: 80, cell: 1 },
  { halfSize: 160, cell: 2 },
  { halfSize: 320, cell: 4 },
  { halfSize: 640, cell: 8 },
  { halfSize: 960, cell: 16 },
];

/** One ring as geometry: XYZ positions (y = 0), the per-vertex cell (world units) and triangle indices, facing +y. */
export interface OceanRingMesh {
  positions: Float32Array;
  cells: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

/** Furthest the camera can see across the sea from its focus: full zoom-out, widest screen. */
export function oceanGridReach(): number {
  return groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, MAX_VIEW_ASPECT);
}

/** The cell the grid's origin snaps to, world units: the coarsest ring's. */
export function oceanGridSnapCell(rings: readonly OceanGridRing[], baseCell: number): number {
  return rings[rings.length - 1].cell * baseCell;
}

/** How far from the focus the grid is guaranteed to reach on every side, world units, whatever the snap. */
export function oceanGridCoverage(rings: readonly OceanGridRing[], baseCell: number): number {
  return rings[rings.length - 1].halfSize * baseCell - oceanGridSnapCell(rings, baseCell) / 2;
}

/** `value` moved to the nearest multiple of `cell`. */
export function snapToCell(value: number, cell: number): number {
  return Math.round(value / cell) * cell;
}

/**
 * The cell, world units, of the ring under the point `(dx, dz)` from the
 * grid's origin: the rings are squares, so the first whose half-side reaches
 * the point's furthest axis. A ring's boundary gets the finer ring's cell, as
 * the vertices the two rings share carry it (`buildOceanRing`); past the
 * outermost ring, its cell. Anything drawn on the sea at its own level of
 * detail (the grid lines, hexOutlineMaterial.ts) reads the displacement at
 * this cell, so it rides the same surface the mesh draws there.
 */
export function oceanGridCellAt(rings: readonly OceanGridRing[], baseCell: number, dx: number, dz: number): number {
  const reach = Math.max(Math.abs(dx), Math.abs(dz));
  const ring = rings.find((r) => reach <= r.halfSize * baseCell) ?? rings[rings.length - 1];
  return ring.cell * baseCell;
}

/** `oceanGridCellAt` in GLSL: `float oceanGridCellAt(vec2 offsetXZ)`, the thresholds unrolled from `rings`. */
export function oceanGridCellGlsl(rings: readonly OceanGridRing[], baseCell: number): string {
  const glslFloat = (x: number) => x.toFixed(6);
  const inner = rings.slice(0, -1);
  const outermost = rings[rings.length - 1];
  const thresholds = inner
    .map((r) => `
    if (reach <= ${glslFloat(r.halfSize * baseCell)}) return ${glslFloat(r.cell * baseCell)};`)
    .join("");
  return `
  // The sea mesh's cell at offsetXZ from the grid origin, world units (oceanGrid.ts).
  float oceanGridCellAt(vec2 offsetXZ) {
    float reach = max(abs(offsetXZ.x), abs(offsetXZ.y));${thresholds}
    return ${glslFloat(outermost.cell * baseCell)};
  }
`;
}

/** `oceanGridCellAt` for the sea's rings, for a vertex stage that floats on the displaced sea. */
export const OCEAN_GRID_CELL_GLSL = oceanGridCellGlsl(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL);

/**
 * The geometry of `ring`, with a hole for `inner` (the ring inside it;
 * undefined for the innermost) stitched to that ring's vertices.
 */
export function buildOceanRing(ring: OceanGridRing, inner: OceanGridRing | undefined, baseCell: number): OceanRingMesh {
  const { halfSize, cell } = ring;
  if (!Number.isInteger(halfSize / cell)) throw new RangeError(`A ring of half-size ${halfSize} is not whole cells of ${cell}.`);
  const innerHalf = inner?.halfSize ?? 0;
  const ratio = inner ? cell / inner.cell : 1;
  if (inner) {
    if (innerHalf >= halfSize) throw new RangeError(`The ring inside (${innerHalf}) must be smaller than the ring (${halfSize}).`);
    if (!Number.isInteger(ratio) || ratio < 1) throw new RangeError(`A ${cell}-cell ring cannot be stitched to ${inner.cell}-cell one.`);
    if (!Number.isInteger(innerHalf / cell)) throw new RangeError(`The hole (${innerHalf}) is not whole cells of ${cell}.`);
  }

  const positions: number[] = [];
  const cells: number[] = [];
  const indexByKey = new Map<string, number>();
  const onHoleBoundary = (x: number, z: number) =>
    inner !== undefined &&
    Math.abs(x) <= innerHalf &&
    Math.abs(z) <= innerHalf &&
    (Math.abs(x) === innerHalf || Math.abs(z) === innerHalf);
  /** The vertex at base-cell lattice point (x, z), made on first use. */
  const vertexAt = (x: number, z: number): number => {
    const key = `${x},${z}`;
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    positions.push(x * baseCell, 0, z * baseCell);
    cells.push((onHoleBoundary(x, z) && inner ? inner.cell : cell) * baseCell);
    indexByKey.set(key, index);
    return index;
  };

  const indices: number[] = [];
  /** Emits triangle (a, b, c) wound to face +y. */
  const triangle = (a: number, b: number, c: number) => {
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const up = (positions[b * 3 + 2] - az) * (positions[c * 3] - ax) - (positions[b * 3] - ax) * (positions[c * 3 + 2] - az);
    if (up > 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };

  const insideHole = (x0: number, z0: number, x1: number, z1: number) =>
    inner !== undefined && x0 >= -innerHalf && x1 <= innerHalf && z0 >= -innerHalf && z1 <= innerHalf;
  /** Which edge of the cell (x0, z0)–(x1, z1) lies along the hole's boundary, as [start, end] corners, or null. */
  const stitchedEdge = (x0: number, z0: number, x1: number, z1: number): [[number, number], [number, number]] | null => {
    if (!inner) return null;
    const spansX = x0 >= -innerHalf && x1 <= innerHalf;
    const spansZ = z0 >= -innerHalf && z1 <= innerHalf;
    if (spansX && z1 === -innerHalf) return [[x0, z1], [x1, z1]]; // the hole is north of the cell
    if (spansX && z0 === innerHalf) return [[x0, z0], [x1, z0]]; // south
    if (spansZ && x1 === -innerHalf) return [[x1, z0], [x1, z1]]; // east
    if (spansZ && x0 === innerHalf) return [[x0, z0], [x0, z1]]; // west
    return null;
  };

  for (let z0 = -halfSize; z0 < halfSize; z0 += cell) {
    for (let x0 = -halfSize; x0 < halfSize; x0 += cell) {
      const x1 = x0 + cell;
      const z1 = z0 + cell;
      if (insideHole(x0, z0, x1, z1)) continue;
      const corners: [number, number][] = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ];
      const edge = stitchedEdge(x0, z0, x1, z1);
      if (!edge || ratio === 1) {
        const [a, b, c, d] = corners.map(([x, z]) => vertexAt(x, z));
        triangle(a, d, b);
        triangle(b, d, c);
        continue;
      }
      // Walk the cell's corners round from the stitched edge's start through
      // its end, inserting the finer ring's points along that edge, then fan
      // from the last corner, which is off the edge.
      const start = corners.findIndex(([x, z]) => x === edge[0][0] && z === edge[0][1]);
      const forward = corners[(start + 1) % 4][0] === edge[1][0] && corners[(start + 1) % 4][1] === edge[1][1];
      const loop: [number, number][] = [];
      for (let i = 0; i < 4; i++) loop.push(corners[(start + (forward ? i : -i) + 4) % 4]);
      const [sx, sz] = edge[0];
      const [ex, ez] = edge[1];
      const inserted: [number, number][] = [];
      for (let k = 1; k < ratio; k++) inserted.push([sx + ((ex - sx) * k) / ratio, sz + ((ez - sz) * k) / ratio]);
      const polygon = [loop[0], ...inserted, loop[1], loop[2], loop[3]].map(([x, z]) => vertexAt(x, z));
      const apex = polygon[polygon.length - 1];
      for (let i = 0; i + 1 < polygon.length - 1; i++) triangle(apex, polygon[i], polygon[i + 1]);
    }
  }

  return {
    positions: new Float32Array(positions),
    cells: new Float32Array(cells),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

/** Every ring's geometry, innermost first. */
export function buildOceanGrid(rings: readonly OceanGridRing[], baseCell: number): OceanRingMesh[] {
  return rings.map((ring, i) => buildOceanRing(ring, i > 0 ? rings[i - 1] : undefined, baseCell));
}
