/**
 * The village as one mesh (#87). Pure, no Three.js.
 *
 * Every village building, every piece of clutter and the town's ground
 * works (walls, kerbs) baked into one vertex-coloured triangle soup: one
 * draw call (and one shadow draw) for the whole village, against one per
 * kind and variant if they were instanced. Each instance is turned,
 * scaled and moved into place; its colours take the building's tint, and
 * its roof (the source's roof range) one of the terracotta tones.
 */
import type { FacetGeometryData } from "./facetBuilder";
import type { Rgb } from "./palmGeometry";

/** A model to place: its triangles and, for a building, its roof's vertex range. */
export interface MergeSource {
  data: FacetGeometryData;
  roofFrom?: number;
  roofTo?: number;
}

/** One placed copy of a source. */
export interface MergeInstance {
  source: number;
  x: number;
  y: number;
  z: number;
  /** Turn about y (the front, local +z, faces (sin yaw, cos yaw)). */
  yaw: number;
  scale: number;
  /** Multiplies every colour. */
  tint?: number;
  /** Multiplies the roof's colours. */
  roofTint?: Rgb;
}

/**
 * Roof tones in the terracotta range, as multipliers on the aged roof
 * colour: fresh, sun-warmed, the base, two weathered and darkened, one
 * mossy. A building's `roofTone` (0…1) picks one, the darker ones about a
 * third of the time.
 */
export const ROOF_TONES: readonly Rgb[] = [
  [1.1, 0.98, 0.9],
  [1.04, 0.9, 0.82],
  [1, 1, 1],
  [0.92, 0.86, 0.84],
  [0.78, 0.74, 0.72],
  [0.66, 0.64, 0.62],
  [0.84, 0.9, 0.78],
];
export const roofTint = (tone: number): Rgb => ROOF_TONES[Math.min(ROOF_TONES.length - 1, Math.floor(tone * ROOF_TONES.length))];

/** Bakes the instances of `sources` and the world-space `extras` into one soup. */
export function mergeVillage(sources: readonly MergeSource[], instances: readonly MergeInstance[], extras: readonly FacetGeometryData[] = []): FacetGeometryData {
  let vertexCount = 0;
  for (const inst of instances) vertexCount += sources[inst.source].data.vertexCount;
  for (const e of extras) vertexCount += e.vertexCount;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let o = 0;
  for (const inst of instances) {
    const src = sources[inst.source];
    const { data } = src;
    const cos = Math.cos(inst.yaw);
    const sin = Math.sin(inst.yaw);
    const tint = inst.tint ?? 1;
    const roof = inst.roofTint ?? [1, 1, 1];
    const roofFrom = src.roofFrom ?? 0;
    const roofTo = src.roofTo ?? 0;
    for (let i = 0; i < data.vertexCount; i++) {
      const px = data.positions[i * 3];
      const py = data.positions[i * 3 + 1];
      const pz = data.positions[i * 3 + 2];
      positions[o * 3] = inst.x + (px * cos + pz * sin) * inst.scale;
      positions[o * 3 + 1] = inst.y + py * inst.scale;
      positions[o * 3 + 2] = inst.z + (-px * sin + pz * cos) * inst.scale;
      const nx = data.normals[i * 3];
      const nz = data.normals[i * 3 + 2];
      normals[o * 3] = nx * cos + nz * sin;
      normals[o * 3 + 1] = data.normals[i * 3 + 1];
      normals[o * 3 + 2] = -nx * sin + nz * cos;
      const onRoof = i >= roofFrom && i < roofTo;
      for (let c = 0; c < 3; c++) colors[o * 3 + c] = Math.min(1, data.colors[i * 3 + c] * tint * (onRoof ? roof[c] : 1));
      o++;
    }
  }
  for (const e of extras) {
    positions.set(e.positions, o * 3);
    normals.set(e.normals, o * 3);
    colors.set(e.colors, o * 3);
    o += e.vertexCount;
  }
  return { positions, normals, colors, vertexCount };
}
