import { describe, it, expect } from "vitest";
import { createFacetBuilder, type FacetGeometryData, type Vec3 } from "./facetBuilder";
import {
  AGED_LEAN,
  boxFace,
  CORNER_CUT_RANGE,
  faceQuad,
  faceSlab,
  flakingTint,
  panel,
  plankedDoor,
  SHUTTERED_WINDOW_TRIANGLES,
  shutteredWindow,
  stoneCourses,
  streak,
  tintGrime,
  wornCuts,
  wornPrism,
  wornRingPoints,
  type AgedColors,
} from "./agedKit";

const colors: AgedColors = {
  wall: [0.8, 0.76, 0.68],
  roof: [0.4, 0.12, 0.06],
  timber: [0.12, 0.09, 0.07],
  stone: [0.3, 0.27, 0.23],
  iron: [0.01, 0.01, 0.01],
};

const vertex = (g: FacetGeometryData, i: number): Vec3 => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const normal = (g: FacetGeometryData, i: number): Vec3 => [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]];
const color = (g: FacetGeometryData, i: number): Vec3 => [g.colors[i * 3], g.colors[i * 3 + 1], g.colors[i * 3 + 2]];
const luminance = (c: Vec3) => (c[0] + c[1] + c[2]) / 3;

function triangleNormal(g: FacetGeometryData, t: number): Vec3 {
  const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const len = Math.hypot(...n);
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** Signed volume: positive when every face winds outwards. */
function signedVolume(g: FacetGeometryData) {
  let volume = 0;
  for (let t = 0; t < g.vertexCount / 3; t++) {
    const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return volume;
}

function expectFlatUnitNormals(g: FacetGeometryData) {
  expect(g.vertexCount % 3).toBe(0);
  for (let t = 0; t < g.vertexCount / 3; t++) {
    const n = triangleNormal(g, t);
    for (let k = 0; k < 3; k++) {
      const stored = normal(g, t * 3 + k);
      expect(Math.hypot(...stored)).toBeCloseTo(1, 5);
      expect(stored[0] * n[0] + stored[1] * n[1] + stored[2] * n[2]).toBeCloseTo(1, 5);
    }
  }
}

describe("worn rings", () => {
  it("cut every corner by its own amount within the range, differently for different seeds", () => {
    const cuts = wornCuts(1);
    expect(new Set(cuts).size).toBe(4);
    for (const c of cuts) {
      expect(c).toBeGreaterThanOrEqual(CORNER_CUT_RANGE[0]);
      expect(c).toBeLessThanOrEqual(CORNER_CUT_RANGE[1]);
    }
    expect(wornCuts(2)).not.toEqual(cuts);
    expect(wornCuts(1)).toEqual(cuts);
  });

  it("lists eight points counter-clockwise from above, the main faces on the even edges", () => {
    const ring = wornRingPoints({ hw: 1, hd: 0.5, y: 2, cuts: [0.1, 0.2, 0.3, 0.4] });
    expect(ring).toHaveLength(8);
    for (const p of ring) expect(p[1]).toBe(2);
    // Left face (−x) on edge 0–1, front (+z) on 2–3, right (+x) on 4–5, back (−z) on 6–7.
    expect(ring[0][0]).toBe(-1);
    expect(ring[1][0]).toBe(-1);
    expect(ring[2][2]).toBe(0.5);
    expect(ring[3][2]).toBe(0.5);
    expect(ring[4][0]).toBe(1);
    expect(ring[5][0]).toBe(1);
    expect(ring[6][2]).toBe(-0.5);
    expect(ring[7][2]).toBe(-0.5);
    // Each corner takes the same cut on both of its edges.
    expect(ring[1][2]).toBeCloseTo(0.5 - 0.2, 9);
    expect(ring[2][0]).toBeCloseTo(-1 + 0.2, 9);
    let area = 0;
    for (let k = 0; k < 8; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % 8];
      area += a[0] * b[2] - b[0] * a[2];
    }
    // The shoelace area has the same sign as a plain box ring's: (−x,−z) → (−x,+z) → (+x,+z) → (+x,−z).
    const box: Vec3[] = [
      [-1, 0, -0.5],
      [-1, 0, 0.5],
      [1, 0, 0.5],
      [1, 0, -0.5],
    ];
    let boxArea = 0;
    for (let k = 0; k < 4; k++) boxArea += box[k][0] * box[(k + 1) % 4][2] - box[(k + 1) % 4][0] * box[k][2];
    expect(Math.sign(area)).toBe(Math.sign(boxArea));
  });
});

describe("wornPrism", () => {
  const build = (panelled: boolean) => {
    const b = createFacetBuilder();
    wornPrism(
      b,
      { hw: 0.1, hd: 0.08, y: 0, cuts: [0.004, 0.012, 0.006, 0.01] },
      { hw: 0.09, hd: 0.07, y: 0.3, cuts: [0.01, 0.005, 0.011, 0.004] },
      colors.wall,
      panelled ? { panel: { cols: 3, rows: 3, cellTint: flakingTint(5) }, seed: 7 } : { seed: 7 }
    );
    return b.build();
  };

  it("closes a tapering, unevenly worn body that winds outwards with flat unit normals", () => {
    for (const panelled of [false, true]) {
      const g = build(panelled);
      expectFlatUnitNormals(g);
      expect(signedVolume(g)).toBeGreaterThan(0);
      // Every side facet faces away from the axis.
      for (let t = 0; t < g.vertexCount / 3; t++) {
        const n = normal(g, t * 3);
        if (Math.abs(n[1]) > 0.99) continue;
        const [a, b, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const cx = (a[0] + b[0] + c[0]) / 3;
        const cz = (a[2] + b[2] + c[2]) / 3;
        expect(cx * n[0] + cz * n[2]).toBeGreaterThan(0);
      }
    }
  });

  it("subdivides each main face into an irregular grid, some cells flaked darker", () => {
    const plain = build(false);
    const panelled = build(true);
    // 8 sides × 2 + 6 + 6 caps, then four 3 × 3 panels in place of four quads.
    expect(plain.vertexCount / 3).toBe(16 + 12);
    expect(panelled.vertexCount / 3).toBe(16 + 12 - 8 + 4 * 18);
    const tones = new Set<number>();
    const xs = new Set<number>();
    for (let i = 0; i < panelled.vertexCount; i++) {
      const n = normal(panelled, i);
      if (Math.abs(n[1]) > 0.5) continue;
      tones.add(Math.round(luminance(color(panelled, i)) * 1e4));
      // The front face: it tapers, so its normal tilts a little off +z.
      if (n[2] > 0.95) xs.add(Math.round(vertex(panelled, i)[0] * 1e4));
    }
    // Flaked cells and plain ones, over the four faces.
    expect(tones.size).toBe(2);
    // Interior split lines are jittered off the thirds.
    expect([...xs].some((x) => Math.abs(x) < 300 && x !== 0)).toBe(true);
  });

  it("is deterministic", () => {
    expect(build(true).positions).toEqual(build(true).positions);
  });
});

describe("panel", () => {
  it("fills exactly the quad it is given, cells reaching every corner", () => {
    const b = createFacetBuilder();
    panel(b, [0, 0, 1], [2, 0, 1], [2, 1, 1], [0, 1, 1], { cols: 4, rows: 2 }, colors.wall, 3);
    const g = b.build();
    expect(g.vertexCount / 3).toBe(16);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      expect(z).toBe(1);
      expect(normal(g, i)[2]).toBeCloseTo(1, 6);
    }
    expect(minX).toBe(0);
    expect(maxX).toBe(2);
    expect(maxY).toBe(1);
  });
});

describe("tintGrime", () => {
  it("darkens the band at the foot of a wall, greener than plain shade, and leaves the top alone", () => {
    const b = createFacetBuilder();
    b.box([-1, -0.1, -1], [1, 1, 1], [0.8, 0.8, 0.8]);
    tintGrime(b, 0, b.vertexCount(), 0.2, 0.3);
    const g = b.build();
    for (let i = 0; i < g.vertexCount; i++) {
      const [, y] = vertex(g, i);
      const c = color(g, i);
      if (y >= 0.2) for (const v of c) expect(v).toBeCloseTo(0.8, 6);
      if (y <= 0) {
        expect(c[0]).toBeCloseTo(0.8 * 0.7, 6);
        expect(c[1]).toBeGreaterThan(c[0]);
        expect(c[2]).toBeLessThan(c[0]);
      }
    }
  });
});

describe("face frames and fixtures", () => {
  it("runs each face's s from its left end seen from outside, with the outward normal", () => {
    const hw = 0.1;
    const hd = 0.05;
    expect(boxFace("front", hw, hd).at(0, 0.3)).toEqual([-hw, 0.3, hd]);
    expect(boxFace("front", hw, hd).at(2 * hw, 0)).toEqual([hw, 0, hd]);
    expect(boxFace("back", hw, hd).at(0, 0)).toEqual([hw, 0, -hd]);
    expect(boxFace("right", hw, hd).at(0, 0)).toEqual([hw, 0, hd]);
    expect(boxFace("left", hw, hd).at(0, 0)).toEqual([-hw, 0, -hd]);
    for (const face of ["front", "back", "left", "right"] as const) {
      const frame = boxFace(face, hw, hd);
      // s runs along (along × up = normal).
      const a = frame.at(0, 0);
      const c = frame.at(0.05, 0);
      const along = [c[0] - a[0], 0, c[2] - a[2]];
      const cross = [-along[2], 0, along[0]];
      const n = frame.normal;
      expect(cross[0] * n[0] + cross[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it("winds a face quad and a slab outwards on every face", () => {
    for (const face of ["front", "back", "left", "right"] as const) {
      const frame = boxFace(face, 0.1, 0.1);
      const b = createFacetBuilder();
      faceQuad(b, frame, 0.02, 0.08, 0.02, 0.06, 0.002, colors.wall);
      faceSlab(b, frame, 0.02, 0.08, 0.02, 0.06, 0.01, colors.timber);
      const g = b.build();
      expectFlatUnitNormals(g);
      expect(g.vertexCount / 3).toBe(2 + 10);
      const n = frame.normal;
      for (let i = 0; i < 6; i++) expect(normal(g, i)[0] * n[0] + normal(g, i)[2] * n[2]).toBeCloseTo(1, 6);
      // No face of the slab looks back into the wall.
      for (let i = 6; i < g.vertexCount; i++) expect(normal(g, i)[0] * n[0] + normal(g, i)[2] * n[2]).toBeGreaterThan(-1e-9);
      // The slab's volume (closed by the wall) winds outwards: its bottom faces down and its top up.
      for (let t = 2; t < 12; t++) {
        const [a, bq, c] = [vertex(g, t * 3), vertex(g, t * 3 + 1), vertex(g, t * 3 + 2)];
        const ys = [a[1], bq[1], c[1]];
        if (ys.every((y) => Math.abs(y - 0.02) < 1e-9)) expect(normal(g, t * 3)[1]).toBeCloseTo(-1, 6);
        if (ys.every((y) => Math.abs(y - 0.06) < 1e-9)) expect(normal(g, t * 3)[1]).toBeCloseTo(1, 6);
      }
    }
  });

  it("builds a door of three planks in alternating tones, a tapering lintel and an iron strap", () => {
    const b = createFacetBuilder();
    plankedDoor(b, boxFace("front", 0.1, 0.07), { s: 0.1, halfWidth: 0.022, height: 0.06, proud: 0.006 }, colors.timber, colors.iron);
    const g = b.build();
    expectFlatUnitNormals(g);
    expect(g.vertexCount / 3).toBe(50);
    const tones = new Set<number>();
    let iron = 0;
    let lintelDepths = new Set<number>();
    for (let i = 0; i < g.vertexCount; i++) {
      const c = color(g, i);
      const [, y, z] = vertex(g, i);
      if (luminance(c) < 0.02) iron++;
      else if (y < 0.059) tones.add(Math.round(luminance(c) * 1e4));
      else lintelDepths.add(Math.round(z * 1e4));
      expect(z).toBeGreaterThanOrEqual(0.07 - 1e-9);
      expect(normal(g, i)[2]).toBeGreaterThan(-1e-9);
    }
    expect(tones.size).toBe(2);
    expect(iron).toBe(30);
    // The lintel's front is deeper at one end than the other.
    expect(lintelDepths.size).toBeGreaterThanOrEqual(3);
  });

  it("hangs a window's shutters open by different angles off the wall, with a sill and a streak under it", () => {
    const frame = boxFace("front", 0.1, 0.07);
    const b = createFacetBuilder();
    shutteredWindow(b, frame, { s: 0.05, halfWidth: 0.014, bottom: 0.05, top: 0.08 }, colors, 11);
    const g = b.build();
    expectFlatUnitNormals(g);
    expect(g.vertexCount / 3).toBe(SHUTTERED_WINDOW_TRIANGLES);
    let leftReach = 0;
    let rightReach = 0;
    let darkest = 1;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      expect(z).toBeGreaterThanOrEqual(0.07 - 1e-9);
      darkest = Math.min(darkest, luminance(color(g, i)));
      // Shutters are timber above the sill.
      if (luminance(color(g, i)) < 0.2 && y > 0.05 + 1e-6) {
        // The window is centred on x = −0.05; the shutters hang either side of it.
        if (x < -0.05) leftReach = Math.max(leftReach, z - 0.07);
        else rightReach = Math.max(rightReach, z - 0.07);
      }
    }
    // Both shutters stand off the wall, one further than the other.
    expect(Math.min(leftReach, rightReach)).toBeGreaterThan(0.003);
    expect(Math.abs(leftReach - rightReach)).toBeGreaterThan(0.003);
    // The opening is near black.
    expect(darkest).toBeLessThan(0.1);
  });

  it("puts shutters on a side face the same way, turned to that face", () => {
    const frame = boxFace("right", 0.1, 0.07);
    const b = createFacetBuilder();
    shutteredWindow(b, frame, { s: 0.05, halfWidth: 0.014, bottom: 0.05, top: 0.08 }, colors, 11);
    const g = b.build();
    expectFlatUnitNormals(g);
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, , z] = vertex(g, i);
      expect(x).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(Math.abs(z)).toBeLessThan(0.07);
    }
  });

  it("draws a streak as a dark strip narrowing downwards, just proud of the wall", () => {
    const b = createFacetBuilder();
    streak(b, boxFace("front", 0.1, 0.07), 0.1, 0.05, 0.03, 0.01, colors.wall);
    const g = b.build();
    expect(g.vertexCount / 3).toBe(2);
    let topWidth = 0;
    let bottomWidth = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const [x, y, z] = vertex(g, i);
      expect(z).toBeGreaterThan(0.07);
      expect(z).toBeLessThan(0.073);
      expect(luminance(color(g, i))).toBeLessThan(luminance(colors.wall) * 0.8);
      if (Math.abs(y - 0.05) < 1e-9) topWidth = Math.max(topWidth, Math.abs(x));
      else bottomWidth = Math.max(bottomWidth, Math.abs(x));
    }
    expect(topWidth).toBeGreaterThan(bottomWidth);
  });
});

describe("stoneCourses", () => {
  const face = () => {
    const frame = boxFace("front", 0.09, 0.09);
    return { frame, widthAt: () => ({ left: 0.008, right: 0.18 - 0.008 }), y0: 0, y1: 0.36 };
  };

  it("lays blocks of unequal widths in courses whose lines wobble, some proud with bevels, over the face", () => {
    const b = createFacetBuilder();
    const blocks = stoneCourses(b, face(), colors.stone, 3);
    const g = b.build();
    expectFlatUnitNormals(g);
    expect(blocks).toBeGreaterThan(15);
    const widths = new Set<number>();
    const prouds = new Set<number>();
    const tops = new Set<number>();
    let bevels = 0;
    for (let t = 0; t < g.vertexCount / 3; t++) {
      const n = normal(g, t * 3);
      expect(n[2]).toBeGreaterThan(-1e-9);
      if (Math.abs(n[2] - 1) > 1e-6) bevels++;
      for (let k = 0; k < 3; k++) {
        const [x, y, z] = vertex(g, t * 3 + k);
        expect(z).toBeGreaterThanOrEqual(0.09 - 1e-9);
        expect(z).toBeLessThan(0.09 + 0.01);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(0.36);
        expect(Math.abs(x)).toBeLessThanOrEqual(0.09);
        prouds.add(Math.round((z - 0.09) * 1e4));
        tops.add(Math.round(y * 1e4));
      }
    }
    // Flat quads sit a hair proud; the bevelled blocks stand further out.
    expect(prouds.has(15)).toBe(true);
    expect([...prouds].some((p) => p >= 40)).toBe(true);
    expect(bevels).toBeGreaterThan(8);
    // Wobbling course lines give many distinct heights, not a few straight ones.
    expect(tops.size).toBeGreaterThan(30);
    // Block widths vary.
    for (let t = 0; t < g.vertexCount / 3; t++) {
      if (Math.abs(normal(g, t * 3)[2] - 1) > 1e-6) continue;
      const xs = [vertex(g, t * 3)[0], vertex(g, t * 3 + 1)[0], vertex(g, t * 3 + 2)[0]];
      widths.add(Math.round((Math.max(...xs) - Math.min(...xs)) * 1e3));
    }
    expect(widths.size).toBeGreaterThan(5);
  });

  it("colours blocks unequally, some with an ochre cast", () => {
    const b = createFacetBuilder();
    stoneCourses(b, face(), colors.stone, 3);
    const g = b.build();
    const tones = new Set<number>();
    let ochre = 0;
    for (let i = 0; i < g.vertexCount; i++) {
      const c = color(g, i);
      tones.add(Math.round(luminance(c) * 1e4));
      if (c[0] / c[2] > (colors.stone[0] / colors.stone[2]) * 1.15) ochre++;
    }
    expect(tones.size).toBeGreaterThan(10);
    expect(ochre).toBeGreaterThan(0);
  });

  it("is deterministic and differs by seed", () => {
    const build = (seed: number) => {
      const b = createFacetBuilder();
      stoneCourses(b, face(), colors.stone, seed);
      return b.build();
    };
    expect(build(3).positions).toEqual(build(3).positions);
    expect(build(3).positions).not.toEqual(build(4).positions);
  });
});

describe("the lean", () => {
  it("is a degree or two", () => {
    expect(Math.atan(AGED_LEAN) * (180 / Math.PI)).toBeGreaterThan(1);
    expect(Math.atan(AGED_LEAN) * (180 / Math.PI)).toBeLessThan(2.5);
  });
});
