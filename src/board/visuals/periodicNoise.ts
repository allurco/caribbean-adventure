/**
 * Simplex noise over the world XZ plane that can repeat east–west, so terrain
 * noise has no seam on a map that wraps (#36).
 *
 * Plain: n(x·f + ox, z·f + oz) with 2D simplex noise.
 * Periodic with world period W: x is wrapped onto a circle of circumference
 * W·f (in noise units) and 3D simplex noise is sampled on that cylinder, so
 * n(x + W, z) = n(x, z) exactly and the arc length (feature size) matches the
 * plain noise's. The x offset turns into an angle, z stays a straight axis.
 */
import { createNoise2D, createNoise3D } from "simplex-noise";

/** Noise in [-1, 1] at world (x, z), at `frequency` cycles per unit, shifted by (offsetX, offsetZ) noise units. */
export type PlaneNoise = (x: number, z: number, frequency: number, offsetX?: number, offsetZ?: number) => number;

/**
 * One noise field seeded from `random` (consumed once, like createNoise2D).
 * `periodX` is the world width it repeats over, or null for plain noise.
 */
export function createPlaneNoise(random: () => number, periodX: number | null): PlaneNoise {
  if (periodX === null) {
    const noise2D = createNoise2D(random);
    return (x, z, frequency, offsetX = 0, offsetZ = 0) => noise2D(x * frequency + offsetX, z * frequency + offsetZ);
  }
  const noise3D = createNoise3D(random);
  const turnsPerUnit = (2 * Math.PI) / periodX;
  return (x, z, frequency, offsetX = 0, offsetZ = 0) => {
    const radius = frequency / turnsPerUnit;
    const angle = x * turnsPerUnit + offsetX / radius;
    return noise3D(radius * Math.cos(angle), radius * Math.sin(angle), z * frequency + offsetZ);
  };
}
