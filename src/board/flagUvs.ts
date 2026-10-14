/**
 * Texture coordinates for a ship's flag (#134), worked out from its shape.
 *
 * In the generator's file the flag is unwrapped into the canvas atlas, at
 * whatever turn the packer gave it. The game draws its own flag on it
 * instead (`shipFlags.ts`), so it needs coordinates that run hoist to fly
 * and foot to head. They come from the cloth's geometry, which the generator
 * fixes (`boats/frigate/wind.py`, `flag_grid`): the flag flies along one
 * horizontal line from its staff, waves across that line, and droops toward
 * its fly. So the fly runs along the vertices' main horizontal axis, the end
 * it droops toward is the fly, and once the droop is taken out each vertex's
 * height says how far it is from the foot. Pure, no Three.js.
 */

/** (u, v) per vertex of `positions` (x, y, z triples, y up): u 0 at the hoist to 1 at the fly, v 0 at the foot to 1 at the head. */
export function flagUvs(positions: ArrayLike<number>): Float32Array {
  const count = Math.floor(positions.length / 3);
  const uv = new Float32Array(count * 2);
  if (count === 0) return uv;

  const x = (k: number) => positions[3 * k];
  const y = (k: number) => positions[3 * k + 1];
  const z = (k: number) => positions[3 * k + 2];

  let [cx, cy, cz] = [0, 0, 0];
  for (let k = 0; k < count; k++) [cx, cy, cz] = [cx + x(k), cy + y(k), cz + z(k)];
  [cx, cy, cz] = [cx / count, cy / count, cz / count];

  // The main horizontal axis: the larger eigenvector of the x–z covariance.
  let [sxx, sxz, szz] = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    const [dx, dz] = [x(k) - cx, z(k) - cz];
    [sxx, sxz, szz] = [sxx + dx * dx, sxz + dx * dz, szz + dz * dz];
  }
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let [ex, ez] = [Math.cos(angle), Math.sin(angle)];

  // Along that axis, the flag droops toward its fly: point the axis that way.
  const along = (k: number) => (x(k) - cx) * ex + (z(k) - cz) * ez;
  let [sff, sfy] = [0, 0];
  for (let k = 0; k < count; k++) {
    const f = along(k);
    [sff, sfy] = [sff + f * f, sfy + f * (y(k) - cy)];
  }
  if (sfy > 0) [ex, ez] = [-ex, -ez];
  const slope = sff > 0 ? -Math.abs(sfy) / sff : 0;

  let [fMin, fMax, rMin, rMax] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let k = 0; k < count; k++) {
    const f = along(k);
    const rest = y(k) - slope * f; // the height with the droop taken out
    [fMin, fMax, rMin, rMax] = [Math.min(fMin, f), Math.max(fMax, f), Math.min(rMin, rest), Math.max(rMax, rest)];
  }
  const [fSpan, rSpan] = [fMax - fMin || 1, rMax - rMin || 1];
  for (let k = 0; k < count; k++) {
    const f = along(k);
    uv[2 * k] = (f - fMin) / fSpan;
    uv[2 * k + 1] = (y(k) - slope * f - rMin) / rSpan;
  }
  return uv;
}
