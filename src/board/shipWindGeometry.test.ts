import { describe, expect, it } from "vitest";
import { clothAttributes, decalBellies, sailBellies, sailPanels } from "./shipWindGeometry";
import { flagClothPosition } from "./shipWind";

interface Mesh {
  positions: number[];
  index: number[];
}

/** A generator-style sail: a grid in a vertical plane, pushed along `push` by the belly falloff (zero at the head, leeches and clews). */
function sail({
  centre,
  across,
  push,
  halfWidth,
  height,
  depth,
  columns = 12,
  rows = 10,
}: {
  centre: [number, number, number];
  across: [number, number, number];
  push: [number, number, number];
  halfWidth: number;
  height: number;
  depth: number;
  columns?: number;
  rows?: number;
}): Mesh & { belly: number[] } {
  const positions: number[] = [];
  const belly: number[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const u = -1 + (2 * i) / columns;
      const v = j / rows;
      const b = depth * (1 - u * u) * (1 - Math.pow(v, 2.2));
      for (let a = 0; a < 3; a++) {
        positions.push(centre[a] + across[a] * u * halfWidth + (a === 1 ? (v - 0.5) * height : 0) + push[a] * b);
        belly.push(push[a] * b);
      }
    }
  }
  const index: number[] = [];
  const at = (i: number, j: number) => j * (columns + 1) + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) index.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  return { positions, index, belly };
}

/** Two meshes as one, the second's indices offset. */
function join(a: Mesh, b: Mesh): Mesh {
  return { positions: [...a.positions, ...b.positions], index: [...a.index, ...b.index.map((k) => k + a.positions.length / 3)] };
}

const course = sail({ centre: [0, 10, 2], across: [1, 0, 0], push: [0, 0, -1], halfWidth: 6, height: 6, depth: 1.3 });
const topsail = sail({ centre: [0, 18, 2.3], across: [1, 0, 0], push: [0, 0, -1], halfWidth: 4, height: 5, depth: 0.9 });
const gaff = sail({ centre: [0, 9, 4], across: [0, 0, 1], push: [1, 0, 0], halfWidth: 5, height: 8, depth: 0.8 });

const vec = (a: ArrayLike<number>, k: number): [number, number, number] => [a[3 * k], a[3 * k + 1], a[3 * k + 2]];

function expectBellies(found: ArrayLike<number>, expected: number[], tolerance: number) {
  expect(found.length).toBe(expected.length);
  for (let k = 0; k < expected.length; k++) expect(Math.abs(found[k] - expected[k])).toBeLessThan(tolerance);
}

describe("sailPanels", () => {
  it("finds each sail as its own panel", () => {
    const both = join(course, join(topsail, gaff));
    expect(sailPanels(both.positions, both.index)).toHaveLength(3);
  });

  it("keeps a panel whole where its vertices are split along a seam", () => {
    // Split the course down the middle: the right half's left column duplicates the left half's right column.
    const left = sail({ centre: [-3, 10, 2], across: [1, 0, 0], push: [0, 0, 0], halfWidth: 3, height: 6, depth: 0 });
    const right = sail({ centre: [3, 10, 2], across: [1, 0, 0], push: [0, 0, 0], halfWidth: 3, height: 6, depth: 0 });
    const split = join(left, right);
    expect(sailPanels(split.positions, split.index)).toHaveLength(1);
  });
});

describe("sailBellies", () => {
  it("recovers a square sail's belly: its offset from the flat plane through its corners", () => {
    expectBellies(sailBellies(course.positions, course.index), course.belly, 1e-6);
  });

  it("recovers each of several sails, square and fore-and-aft, on its own plane", () => {
    const all = join(course, join(topsail, gaff));
    expectBellies(sailBellies(all.positions, all.index), [...course.belly, ...topsail.belly, ...gaff.belly], 1e-6);
  });

  it("is zero at the head, the leeches and the clews", () => {
    const found = sailBellies(course.positions, course.index);
    const columns = 12;
    const rows = 10;
    for (let j = 0; j <= rows; j++) {
      for (const i of [0, columns]) expect(Math.hypot(...vec(found, j * (columns + 1) + i))).toBeLessThan(1e-9);
    }
    for (let i = 0; i <= columns; i++) expect(Math.hypot(...vec(found, rows * (columns + 1) + i))).toBeLessThan(1e-9);
  });

  it("works whichever way the triangles wind", () => {
    const flipped = { ...course, index: course.index.map((_, k, a) => a[k - (k % 3) + [0, 2, 1][k % 3]]) };
    expectBellies(sailBellies(flipped.positions, flipped.index), course.belly, 1e-6);
  });
});

describe("decalBellies", () => {
  it("moves a band lying on a sail with the sail beneath it, not with its own stand-off", () => {
    // Points on the course's surface (between its vertices), standing 2 cm proud of it toward the belly.
    const band: number[] = [];
    const expected: number[] = [];
    for (const [u, v] of [
      [0.13, 0.27],
      [-0.41, 0.33],
      [0.66, 0.31],
    ]) {
      const b = 1.3 * (1 - u * u) * (1 - Math.pow(v, 2.2));
      band.push(u * 6, 10 + (v - 0.5) * 6, 2 - b - 0.02);
      expected.push(0, 0, -b);
    }
    // The surface between vertices is the grid's interpolation; within a cell that is within ~1 cm of the falloff.
    expectBellies(decalBellies(band, course.positions, course.index), expected, 0.02);
  });

  it("finds the sail each decal lies on", () => {
    const all = join(course, gaff);
    const onGaff = [0.5 + 0.02, 9, 4];
    const found = decalBellies(onGaff, all.positions, all.index);
    expect(found[0]).toBeGreaterThan(0.5);
    expect(Math.abs(found[2])).toBeLessThan(1e-9);
  });
});

describe("clothAttributes", () => {
  // A flag flying forward (−Z) from its staff at (0.2, ·, 11), 2.5 m long and 1.5 m tall, drooping and waving.
  const flag: number[] = [];
  for (let j = 0; j <= 4; j++) {
    for (let i = 0; i <= 8; i++) {
      const along = (2.5 * i) / 8;
      flag.push(0.2 + 0.12 * Math.sin((along * 2 * Math.PI) / 2.5) * (i / 8), 27 + (1.5 * j) / 4 - 0.25 * (i / 8), 11 - along);
    }
  }
  const cloth = clothAttributes(flag);
  const count = flag.length / 3;

  it("finds the hoist at the staff and the fly forward", () => {
    for (let k = 0; k < count; k++) {
      expect(cloth.hoist[3 * k]).toBeCloseTo(0.2, 6);
      expect(cloth.hoist[3 * k + 1]).toBeCloseTo(11, 6);
      expect(cloth.hoist[3 * k + 2]).toBeCloseTo(Math.atan2(-1, 0), 6);
    }
  });

  it("runs u from 0 at the hoist to 1 at the fly, over the cloth's length", () => {
    for (let k = 0; k < count; k++) {
      const i = k % 9;
      expect(cloth.local[4 * k + 2]).toBeCloseTo(i / 8, 6);
      expect(cloth.local[4 * k + 3]).toBeCloseTo(2.5, 6);
    }
  });

  it("leaves the cloth as modelled when it streams the way it was modelled", () => {
    for (let k = 0; k < count; k++) {
      const [x, y, z] = vec(flag, k);
      const p = flagClothPosition(
        {
          hoist: [cloth.hoist[3 * k], cloth.hoist[3 * k + 1]],
          along: cloth.local[4 * k],
          across: cloth.local[4 * k + 1],
          u: cloth.local[4 * k + 2],
          length: cloth.local[4 * k + 3],
        },
        y,
        [0, -1],
        0,
        0,
        0
      );
      expect(p[0]).toBeCloseTo(x, 6);
      expect(p[1]).toBeCloseTo(y, 6);
      expect(p[2]).toBeCloseTo(z, 6);
    }
  });

  it("marks every cloth vertex with its length, so the shader can tell cloth from the rest", () => {
    for (let k = 0; k < count; k++) expect(cloth.local[4 * k + 3]).toBeGreaterThan(0);
  });
});
