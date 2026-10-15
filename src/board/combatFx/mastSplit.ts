/**
 * PROTOTYPE (combat animation lab, PRD #259): breaking the mainmast off a
 * ship model. The generator exports every mast as one `Masts` node, so the
 * mainmast is found by where its geometry stands along the keel, and the
 * merged ship's triangles above the break over that stretch (spars, sails,
 * rigging) are split off to fall as one piece. Model frame: metres, y up,
 * the keel along z.
 */

export interface MastStation {
  /** Where the mast stands along the keel. */
  z: number;
  /** Its masthead height. */
  top: number;
}

export interface MastCut {
  zMin: number;
  zMax: number;
  /** Height of the break. */
  yBreak: number;
  /** The point the piece above the break pivots on: on the mast, at the break. */
  pivot: [number, number, number];
}

/** Gap along the keel (m) that separates one mast's geometry from the next. */
const STATION_GAP = 1.5;

/** The masts in `points` (xyz triples) above `minY`, by station along the keel, bow-ward last. */
export function mastStations(points: ArrayLike<number>, minY: number): MastStation[] {
  const found: { z: number; y: number }[] = [];
  for (let i = 0; i < points.length; i += 3) if (points[i + 1] > minY) found.push({ z: points[i + 2], y: points[i + 1] });
  found.sort((a, b) => a.z - b.z);
  const stations: { zs: number[]; top: number }[] = [];
  for (const p of found) {
    const last = stations[stations.length - 1];
    if (last && p.z - last.zs[last.zs.length - 1] < STATION_GAP) {
      last.zs.push(p.z);
      last.top = Math.max(last.top, p.y);
    } else stations.push({ zs: [p.z], top: p.y });
  }
  // A station stands where most of its height is: the median z.
  return stations.map(({ zs, top }) => ({ z: zs[Math.floor(zs.length / 2)], top }));
}

/** The cut through the tallest mast, `breakShare` of the way from the deck to its head. */
export function mainMastCut(stations: readonly MastStation[], { deckY, breakShare }: { deckY: number; breakShare: number }): MastCut {
  let main = 0;
  stations.forEach((s, i) => {
    if (s.top > stations[main].top) main = i;
  });
  const m = stations[main];
  const before = stations[main - 1];
  const after = stations[main + 1];
  const yBreak = deckY + breakShare * (m.top - deckY);
  return {
    zMin: before ? (before.z + m.z) / 2 : m.z - 12,
    zMax: after ? (after.z + m.z) / 2 : m.z + 12,
    yBreak,
    pivot: [0, yBreak, m.z],
  };
}

/** The triangles of `index` whose centroid is above the break over the cut's stretch (`cut`), and the rest (`kept`). */
export function splitTriangles(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  region: Pick<MastCut, "zMin" | "zMax" | "yBreak">
): { kept: Uint32Array; cut: Uint32Array } {
  const kept: number[] = [];
  const cut: number[] = [];
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const y = (positions[3 * a + 1] + positions[3 * b + 1] + positions[3 * c + 1]) / 3;
    const z = (positions[3 * a + 2] + positions[3 * b + 2] + positions[3 * c + 2]) / 3;
    (y > region.yBreak && z >= region.zMin && z <= region.zMax ? cut : kept).push(a, b, c);
  }
  return { kept: new Uint32Array(kept), cut: new Uint32Array(cut) };
}
