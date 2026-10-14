/**
 * What a ship model's canvas needs to move in the wind (#204), worked out
 * once per loaded model from its shape, as vertex attributes for the merged
 * meshes (`shipModelMerge.ts`). Pure, no Three.js; the shader side is
 * `shipWind.ts`.
 *
 * - **Sails.** The generator (`boats/frigate/wind.py`) models each sail full:
 *   a flat panel pushed out by a falloff that is zero along its head, its
 *   leeches and so at its corners. So the flat plane is the one through the
 *   panel's corners, and each vertex's belly is its offset from that plane
 *   (`sailBellies`), which the shader scales by how full the sail is.
 * - **Decals on sails** (the patches and the owner's band): each moves with
 *   the sail beneath it (`decalBellies`), so it stays on the canvas.
 * - **Cloth** (the flag and the pennant): each vertex's hoist, its place
 *   along and across the modelled fly, and its share of the length
 *   (`clothAttributes`), so the shader can turn the cloth about its hoist
 *   onto the wind.
 *
 * All in the model's frame: real metres, y up.
 */
import { flagUvs } from "./flagUvs";

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** Positions closer than this (model metres) are one point: a seam's split vertices. */
const WELD_METRES = 1e-4;

/** One sail: its vertices, its triangles and the flat plane through its corners, the normal toward its belly. */
export interface SailPanel {
  readonly vertices: readonly number[];
  readonly triangles: readonly (readonly [number, number, number])[];
  /** A point on the flat plane. */
  readonly origin: Vec3;
  /** The flat plane's unit normal, toward the belly. */
  readonly normal: Vec3;
  /** Unit axes in the plane, for coordinates across the sail. */
  readonly axes: readonly [Vec3, Vec3];
}

const point = (positions: ArrayLike<number>, k: number): Vec3 => [positions[3 * k], positions[3 * k + 1], positions[3 * k + 2]];

/** Two unit axes spanning the plane with unit normal `n`: the first horizontal unless the plane is level. */
function planeAxes(n: Vec3): [Vec3, Vec3] {
  const level = cross([0, 1, 0], n);
  const first = length(level) > 1e-3 ? unit(level) : unit(cross([1, 0, 0], n));
  return [first, cross(n, first)];
}

/** The connected panels of a sail mesh: vertices joined by a triangle or by sharing a position. */
function components(positions: ArrayLike<number>, index: ArrayLike<number>): number[][] {
  const count = Math.floor(positions.length / 3);
  const parent = Array.from({ length: count }, (_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  const union = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent[rb] = ra;
  };
  for (let t = 0; t + 2 < index.length; t += 3) {
    union(index[t], index[t + 1]);
    union(index[t], index[t + 2]);
  }
  const welded = new Map<string, number>();
  for (let k = 0; k < count; k++) {
    const key = point(positions, k)
      .map((v) => Math.round(v / WELD_METRES))
      .join(",");
    const seen = welded.get(key);
    if (seen === undefined) welded.set(key, k);
    else union(seen, k);
  }
  const groups = new Map<number, number[]>();
  for (let k = 0; k < count; k++) {
    const root = find(k);
    const group = groups.get(root) ?? [];
    group.push(k);
    groups.set(root, group);
  }
  return [...groups.values()];
}

/** The sail panels of a mesh (`positions` x, y, z triples; `index` its triangles). */
export function sailPanels(positions: ArrayLike<number>, index: ArrayLike<number>): SailPanel[] {
  const groups = components(positions, index);
  const groupOf = new Int32Array(Math.floor(positions.length / 3));
  groups.forEach((vertices, g) => vertices.forEach((k) => (groupOf[k] = g)));
  const triangles: [number, number, number][][] = groups.map(() => []);
  for (let t = 0; t + 2 < index.length; t += 3) triangles[groupOf[index[t]]].push([index[t], index[t + 1], index[t + 2]]);

  const panels: SailPanel[] = [];
  groups.forEach((vertices, g) => {
    // The cloth's mean facing, each triangle turned to agree with the sum so far, however it winds.
    let facing: Vec3 = [0, 0, 0];
    for (const [a, b, c] of triangles[g]) {
      const pa = point(positions, a);
      const area = cross(sub(point(positions, b), pa), sub(point(positions, c), pa));
      facing = dot(area, facing) < 0 ? sub(facing, area) : [facing[0] + area[0], facing[1] + area[1], facing[2] + area[2]];
    }
    if (length(facing) === 0) return;
    const [a1, a2] = planeAxes(unit(facing));

    // Its corners: the extremes across the cloth, diagonally. The belly is zero there.
    const corners: number[] = [];
    for (const [s1, s2] of [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ]) {
      const direction = [a1[0] * s1 + a2[0] * s2, a1[1] * s1 + a2[1] * s2, a1[2] * s1 + a2[2] * s2] as Vec3;
      let best = vertices[0];
      for (const k of vertices) if (dot(point(positions, k), direction) > dot(point(positions, best), direction)) best = k;
      if (!corners.some((c) => length(sub(point(positions, c), point(positions, best))) < WELD_METRES)) corners.push(best);
    }
    const cornerPoints = corners.map((k) => point(positions, k));
    const origin = scale(cornerPoints.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]), 1 / corners.length);

    // The plane through the corners (Newell's normal of the corner polygon, in order round the sail).
    let normal = unit(facing);
    if (cornerPoints.length >= 3) {
      let newell: Vec3 = [0, 0, 0];
      cornerPoints.forEach((p, i) => {
        const q = cornerPoints[(i + 1) % cornerPoints.length];
        newell = [newell[0] + (p[1] - q[1]) * (p[2] + q[2]), newell[1] + (p[2] - q[2]) * (p[0] + q[0]), newell[2] + (p[0] - q[0]) * (p[1] + q[1])];
      });
      if (length(newell) > 1e-9) normal = unit(newell);
    }
    // Toward the belly.
    const mean = vertices.reduce((s, k) => s + dot(sub(point(positions, k), origin), normal), 0);
    if (mean < 0) normal = scale(normal, -1);

    panels.push({ vertices, triangles: triangles[g], origin, normal, axes: planeAxes(normal) });
  });
  return panels;
}

/** Each vertex's belly (x, y, z triples): its offset from its sail's flat plane, model metres. */
export function sailBellies(positions: ArrayLike<number>, index: ArrayLike<number>): Float32Array {
  const bellies = new Float32Array(Math.floor(positions.length / 3) * 3);
  for (const { vertices, origin, normal } of sailPanels(positions, index)) {
    for (const k of vertices) {
      const d = scale(normal, dot(sub(point(positions, k), origin), normal));
      bellies.set(d, 3 * k);
    }
  }
  return bellies;
}

/**
 * The belly of each vertex of a decal lying on the sails (the patches, the
 * owner's band): the belly of the sail surface beneath it, so it moves with
 * the canvas and keeps its stand-off from it.
 */
export function decalBellies(positions: ArrayLike<number>, sailPositions: ArrayLike<number>, sailIndex: ArrayLike<number>): Float32Array {
  const count = Math.floor(positions.length / 3);
  const bellies = new Float32Array(count * 3);
  const panels = sailPanels(sailPositions, sailIndex);
  const sailCount = Math.floor(sailPositions.length / 3);
  const panelOf = new Int32Array(sailCount).fill(-1);
  panels.forEach((panel, p) => panel.vertices.forEach((k) => (panelOf[k] = p)));
  const offset = (k: number, panel: SailPanel) => dot(sub(point(sailPositions, k), panel.origin), panel.normal);

  for (let d = 0; d < count; d++) {
    const at = point(positions, d);
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let k = 0; k < sailCount; k++) {
      if (panelOf[k] < 0) continue;
      const distance = length(sub(point(sailPositions, k), at));
      if (distance < nearestDistance) [nearest, nearestDistance] = [k, distance];
    }
    if (nearest < 0) continue;
    const panel = panels[panelOf[nearest]];
    const [a1, a2] = panel.axes;
    const across = (p: Vec3): [number, number] => [dot(sub(p, panel.origin), a1), dot(sub(p, panel.origin), a2)];
    const [x, y] = across(at);

    // The sail's offset at the decal's place across it: the triangle under it, interpolated.
    let belly = offset(nearest, panel);
    for (const [a, b, c] of panel.triangles) {
      const [[ax, ay], [bx, by], [cx, cy]] = [a, b, c].map((k) => across(point(sailPositions, k)));
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-12) continue;
      const la = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
      const lb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
      const lc = 1 - la - lb;
      if (la < -1e-6 || lb < -1e-6 || lc < -1e-6) continue;
      belly = la * offset(a, panel) + lb * offset(b, panel) + lc * offset(c, panel);
      break;
    }
    bellies.set(scale(panel.normal, belly), 3 * d);
  }
  return bellies;
}

/** Share of the length at each end whose vertices place the hoist and the fly. */
const CLOTH_END_SHARE = 0.02;

export interface ClothAttributes {
  /** Per vertex: the hoist's x and z, and the modelled fly's angle (radians from +X toward +Z). */
  readonly hoist: Float32Array;
  /** Per vertex: along the modelled fly from the hoist, across it (model metres), u (0 hoist … 1 fly) and the cloth's length. */
  readonly local: Float32Array;
}

/** A flag's or pennant's cloth attributes, from its shape (`flagUvs` finds which end is the hoist). */
export function clothAttributes(positions: ArrayLike<number>): ClothAttributes {
  const count = Math.floor(positions.length / 3);
  const hoist = new Float32Array(count * 3);
  const local = new Float32Array(count * 4);
  if (count === 0) return { hoist, local };
  const uv = flagUvs(positions);
  const meanXZ = (pick: (u: number) => boolean): [number, number] => {
    let [x, z, n] = [0, 0, 0];
    for (let k = 0; k < count; k++) if (pick(uv[2 * k])) [x, z, n] = [x + positions[3 * k], z + positions[3 * k + 2], n + 1];
    return [x / n, z / n];
  };
  const [hx, hz] = meanXZ((u) => u <= CLOTH_END_SHARE);
  const [fx, fz] = meanXZ((u) => u >= 1 - CLOTH_END_SHARE);
  const span = Math.hypot(fx - hx, fz - hz) || 1;
  const [ex, ez] = [(fx - hx) / span, (fz - hz) / span];
  const flyAngle = Math.atan2(ez, ex);

  let clothLength = 0;
  const along = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    along[k] = (positions[3 * k] - hx) * ex + (positions[3 * k + 2] - hz) * ez;
    clothLength = Math.max(clothLength, along[k]);
  }
  // No length to fly: leave it off the cloth (length 0), where the shader leaves it be.
  if (!(clothLength > 0)) return { hoist, local };
  for (let k = 0; k < count; k++) {
    const [dx, dz] = [positions[3 * k] - hx, positions[3 * k + 2] - hz];
    hoist.set([hx, hz, flyAngle], 3 * k);
    local.set([along[k], -dx * ez + dz * ex, Math.min(1, Math.max(0, along[k] / clothLength)), clothLength], 4 * k);
  }
  return { hoist, local };
}
