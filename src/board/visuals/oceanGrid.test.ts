import { describe, expect, it } from "vitest";
import {
  OCEAN_GRID_BASE_CELL,
  OCEAN_GRID_RINGS,
  OCEAN_GRID_CELL_GLSL,
  buildOceanGrid,
  buildOceanRing,
  oceanGridCellAt,
  oceanGridCellGlsl,
  oceanGridCoverage,
  oceanGridReach,
  oceanGridSnapCell,
  snapToCell,
  type OceanGridRing,
  type OceanRingMesh,
} from "./oceanGrid";
import {
  CAMERA_FOV,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_PITCH,
  MAX_VIEW_ASPECT,
  groundViewReach,
} from "../cameraBounds";

const vertex = (mesh: OceanRingMesh, i: number): [number, number] => [mesh.positions[i * 3], mesh.positions[i * 3 + 2]];

/** Each undirected edge of the triangles and how many triangles share it. */
function edgeCounts(mesh: OceanRingMesh): Map<string, number> {
  const counts = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const tri = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Twice the signed area of triangle t, positive when its normal points up (+y). */
function doubleArea(mesh: OceanRingMesh, t: number): number {
  const [ax, az] = vertex(mesh, mesh.indices[t]);
  const [bx, bz] = vertex(mesh, mesh.indices[t + 1]);
  const [cx, cz] = vertex(mesh, mesh.indices[t + 2]);
  return (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
}

// Positions are float32, so a loose tolerance.
const EPS = 1e-6;
const onSquare = (x: number, z: number, half: number) =>
  Math.abs(Math.abs(x) - half) < EPS ? Math.abs(z) <= half + EPS : Math.abs(Math.abs(z) - half) < EPS && Math.abs(x) <= half + EPS;

const key = (x: number, z: number) => `${x.toFixed(6)},${z.toFixed(6)}`;

describe("buildOceanRing", () => {
  const base = 0.1;
  const inner: OceanGridRing = { halfSize: 8, cell: 1 };
  const outer: OceanGridRing = { halfSize: 16, cell: 2 };

  it("builds the innermost ring as a plain square grid of its cell", () => {
    const mesh = buildOceanRing(inner, undefined, base);
    expect(mesh.vertexCount).toBe(17 * 17);
    expect(mesh.triangleCount).toBe(2 * 16 * 16);
    expect(mesh.positions).toHaveLength(mesh.vertexCount * 3);
    for (let i = 0; i < mesh.vertexCount; i++) {
      expect(mesh.positions[i * 3 + 1]).toBe(0);
      expect(Math.abs(mesh.positions[i * 3])).toBeLessThanOrEqual(0.8 + EPS);
      expect(mesh.cells[i]).toBeCloseTo(0.1, 6);
    }
  });

  it("leaves a hole for the ring inside and splits its edge cells to meet the finer ring's vertices", () => {
    const mesh = buildOceanRing(outer, inner, base);
    // Lattice points of the annulus plus one midpoint per coarse edge on the hole's boundary.
    const lattice = 17 * 17 - 7 * 7;
    const midpoints = 4 * 8;
    expect(mesh.vertexCount).toBe(lattice + midpoints);
    // Plain cells give two triangles, the 4 × 8 cells along the hole three.
    expect(mesh.triangleCount).toBe(2 * (16 * 16 - 8 * 8) + 4 * 8);
    for (let i = 0; i < mesh.vertexCount; i++) {
      const [x, z] = vertex(mesh, i);
      expect(Math.abs(x) < 0.8 - EPS && Math.abs(z) < 0.8 - EPS).toBe(false);
    }
  });

  it("gives the vertices it shares with the finer ring that ring's cell, and its own to the rest", () => {
    const mesh = buildOceanRing(outer, inner, base);
    for (let i = 0; i < mesh.vertexCount; i++) {
      const [x, z] = vertex(mesh, i);
      expect(mesh.cells[i]).toBeCloseTo(onSquare(x, z, 0.8) ? 0.1 : 0.2, 6);
    }
  });

  it("is watertight: every inner edge is shared by two triangles and the boundary edges by one", () => {
    const mesh = buildOceanRing(outer, inner, base);
    for (const [edge, count] of edgeCounts(mesh)) {
      const [a, b] = edge.split("-").map(Number);
      const [ax, az] = vertex(mesh, a);
      const [bx, bz] = vertex(mesh, b);
      // Along one side of the outer square or of the hole (a corner cell's
      // diagonal joins two sides and is an inner edge).
      const alongSide = (half: number) =>
        onSquare(ax, az, half) &&
        onSquare(bx, bz, half) &&
        ((Math.abs(ax - bx) < EPS && Math.abs(Math.abs(ax) - half) < EPS) || (Math.abs(az - bz) < EPS && Math.abs(Math.abs(az) - half) < EPS));
      expect(count, `edge ${edge}`).toBe(alongSide(1.6) || alongSide(0.8) ? 1 : 2);
    }
  });

  it("faces up and tiles the annulus exactly", () => {
    const mesh = buildOceanRing(outer, inner, base);
    let area = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const twice = doubleArea(mesh, t);
      expect(twice).toBeGreaterThan(0);
      area += twice / 2;
    }
    expect(area).toBeCloseTo(3.2 * 3.2 - 1.6 * 1.6, 4);
  });

  it("stitches a ring four times coarser than the one inside with three points per edge", () => {
    const mesh = buildOceanRing({ halfSize: 16, cell: 4 }, inner, base);
    expect(mesh.vertexCount).toBe(9 * 9 - 3 * 3 + 4 * 4 * 3);
    expect(mesh.triangleCount).toBe(2 * (8 * 8 - 4 * 4) + 4 * 4 * 3);
    for (const [, count] of edgeCounts(mesh)) expect(count).toBeLessThanOrEqual(2);
  });

  it("refuses rings whose cells do not divide their sizes or each other", () => {
    expect(() => buildOceanRing({ halfSize: 9, cell: 2 }, undefined, base)).toThrow(RangeError);
    expect(() => buildOceanRing({ halfSize: 16, cell: 3 }, inner, base)).toThrow(RangeError);
    expect(() => buildOceanRing({ halfSize: 16, cell: 1 }, { halfSize: 8, cell: 2 }, base)).toThrow(RangeError);
    expect(() => buildOceanRing({ halfSize: 8, cell: 2 }, inner, base)).toThrow(RangeError);
  });
});

describe("OCEAN_GRID_RINGS", () => {
  const meshes = buildOceanGrid(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL);

  it("grows outward, each ring twice the size and twice the cell of the last", () => {
    for (let i = 1; i < OCEAN_GRID_RINGS.length; i++) {
      expect(OCEAN_GRID_RINGS[i].halfSize).toBeGreaterThan(OCEAN_GRID_RINGS[i - 1].halfSize);
      expect(OCEAN_GRID_RINGS[i].cell).toBe(2 * OCEAN_GRID_RINGS[i - 1].cell);
    }
  });

  it("resolves the swell at ship zoom: the innermost cell is about a swell texel (6.5 m)", () => {
    expect(OCEAN_GRID_RINGS[0].cell * OCEAN_GRID_BASE_CELL).toBeCloseTo(0.1, 12);
  });

  it("shares every boundary vertex with the ring outside it, bit for bit", () => {
    for (let i = 1; i < meshes.length; i++) {
      const half = OCEAN_GRID_RINGS[i - 1].halfSize * OCEAN_GRID_BASE_CELL;
      const outerBoundary = new Set<string>();
      for (let v = 0; v < meshes[i].vertexCount; v++) {
        const [x, z] = vertex(meshes[i], v);
        if (onSquare(x, z, half)) outerBoundary.add(key(x, z));
      }
      const innerBoundary = new Set<string>();
      for (let v = 0; v < meshes[i - 1].vertexCount; v++) {
        const [x, z] = vertex(meshes[i - 1], v);
        if (onSquare(x, z, half)) innerBoundary.add(key(x, z));
      }
      expect(outerBoundary).toEqual(innerBoundary);
    }
  });

  it("stays under a hundred thousand vertices in all", () => {
    const total = meshes.reduce((sum, m) => sum + m.vertexCount, 0);
    expect(total).toBeLessThan(100_000);
    expect(total).toBeGreaterThan(50_000);
  });

  it("covers the sea the camera can reach at full zoom-out on the widest screen, after snapping", () => {
    const reach = groundViewReach(CAMERA_MAX_DISTANCE, CAMERA_PITCH, CAMERA_FOV, MAX_VIEW_ASPECT);
    expect(oceanGridReach()).toBe(reach);
    expect(oceanGridCoverage(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL)).toBeGreaterThan(reach);
  });

  it("keeps the fine ring under the whole view at the closest ship zoom on a 16:9 screen", () => {
    // The closest zoom is the same on every map size (#62); the fine ring must still cover the view there.
    const reach = groundViewReach(CAMERA_MIN_DISTANCE, CAMERA_PITCH, CAMERA_FOV, 16 / 9);
    const fine = OCEAN_GRID_RINGS[0].halfSize * OCEAN_GRID_BASE_CELL - oceanGridSnapCell(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL) / 2;
    expect(fine).toBeGreaterThan(reach);
  });
});

describe("oceanGridCellAt", () => {
  const base = 0.1;
  const rings: OceanGridRing[] = [
    { halfSize: 8, cell: 1 },
    { halfSize: 16, cell: 2 },
    { halfSize: 32, cell: 4 },
  ];

  it("gives a point the cell of the ring it falls in, by its furthest axis from the origin", () => {
    expect(oceanGridCellAt(rings, base, 0, 0)).toBeCloseTo(0.1, 12);
    expect(oceanGridCellAt(rings, base, 0.5, -0.3)).toBeCloseTo(0.1, 12);
    expect(oceanGridCellAt(rings, base, 1.2, 0)).toBeCloseTo(0.2, 12);
    expect(oceanGridCellAt(rings, base, 0.1, -1.2)).toBeCloseTo(0.2, 12);
    expect(oceanGridCellAt(rings, base, 2.0, 2.0)).toBeCloseTo(0.4, 12);
    // Square rings: a point on the diagonal is in the ring its larger coordinate reaches.
    expect(oceanGridCellAt(rings, base, 0.7, 0.7)).toBeCloseTo(0.1, 12);
  });

  it("gives a ring's boundary the finer ring's cell, as the shared vertices carry it", () => {
    expect(oceanGridCellAt(rings, base, 0.8, 0.2)).toBeCloseTo(0.1, 12);
    expect(oceanGridCellAt(rings, base, -0.2, 1.6)).toBeCloseTo(0.2, 12);
  });

  it("gives the coarsest cell past the outermost ring", () => {
    expect(oceanGridCellAt(rings, base, 3.2, 0)).toBeCloseTo(0.4, 12);
    expect(oceanGridCellAt(rings, base, 50, -50)).toBeCloseTo(0.4, 12);
  });

  it("agrees with every vertex's cell in the built rings", () => {
    const meshes = buildOceanGrid(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL);
    for (const mesh of meshes) {
      for (let v = 0; v < mesh.vertexCount; v++) {
        const [x, z] = vertex(mesh, v);
        expect(oceanGridCellAt(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL, x, z), `vertex at ${x}, ${z}`).toBeCloseTo(mesh.cells[v], 6);
      }
    }
  });

  it("is mirrored in GLSL, one threshold per ring from the same constants", () => {
    const glsl = oceanGridCellGlsl(rings, base);
    expect(glsl).toContain("float oceanGridCellAt(vec2 offsetXZ)");
    expect(glsl).toContain("max(abs(offsetXZ.x), abs(offsetXZ.y))");
    const thresholds = [...glsl.matchAll(/if \(reach <= ([\d.]+)\) return ([\d.]+);/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(thresholds).toEqual([
      [0.8, 0.1],
      [1.6, 0.2],
    ]);
    expect(glsl).toMatch(/return 0\.4(0*);\s*}\s*$/);
    expect(OCEAN_GRID_CELL_GLSL).toBe(oceanGridCellGlsl(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL));
  });
});

describe("snapping", () => {
  it("snaps to the coarsest ring's cell, so every ring's vertices land on their own lattice", () => {
    expect(oceanGridSnapCell(OCEAN_GRID_RINGS, OCEAN_GRID_BASE_CELL)).toBeCloseTo(1.6, 12);
  });

  it("snaps a value to the nearest multiple of the cell, within half a cell", () => {
    expect(snapToCell(0, 1.6)).toBe(0);
    expect(snapToCell(1.6, 1.6)).toBeCloseTo(1.6, 12);
    expect(snapToCell(2.3, 1.6)).toBeCloseTo(1.6, 12);
    expect(snapToCell(2.5, 1.6)).toBeCloseTo(3.2, 12);
    expect(snapToCell(-0.9, 1.6)).toBeCloseTo(-1.6, 12);
    for (let v = -10; v < 10; v += 0.37) {
      const s = snapToCell(v, 1.6);
      expect(Math.abs(s - v)).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(snapToCell(s, 1.6)).toBeCloseTo(s, 12);
    }
  });
});
