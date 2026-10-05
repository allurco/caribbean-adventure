/**
 * The wave cascades side by side in one texture (#38 step 5), so a single
 * sequence of GPU passes evolves and transforms all of them: cascade c's
 * grid occupies atlas columns [c·size, (c + 1)·size). Row passes of the FFT
 * stay inside a cascade's block of columns and column passes inside its
 * column, so the cascades never mix. Every pass is a draw call with its own
 * fixed cost; batching keeps three cascades at about the draw count of one.
 */

/** RGBA `size`² grids (row-major, index z · size + x) packed into one (N · size) × size atlas. */
export function packCascadeAtlas(grids: readonly Float32Array[], size: number): Float32Array {
  const width = grids.length * size;
  const atlas = new Float32Array(width * size * 4);
  grids.forEach((grid, c) => {
    if (grid.length !== size * size * 4) {
      throw new RangeError(`Cascade ${c} holds ${grid.length / 4} texels, not ${size}².`);
    }
    for (let z = 0; z < size; z++) {
      atlas.set(grid.subarray(z * size * 4, (z + 1) * size * 4), (z * width + c * size) * 4);
    }
  });
  return atlas;
}
