/**
 * Splitting one wave spectrum across several FFT cascades (#38 step 5).
 *
 * Each cascade carries the wavenumbers kMin ≤ |k| < kMax of the same JONSWAP
 * sea. The bands are laid end to end, longest waves first: the first starts at
 * 0 and each band starts where the one before it stops, so every wavenumber up
 * to the last band's end is carried by exactly one cascade and the summed
 * spectrum is the sea's spectrum, once.
 *
 * A band ends at BAND_NYQUIST_SHARE of its grid's Nyquist wavenumber, so its
 * shortest wave spans four texels. Bilinear look-ups reconstruct a wave that
 * wide smoothly; waves of two or three texels come out faceted when the view
 * magnifies the tile. The band is a disc in k-space, so it is the same in
 * every direction (the grid's corners, out to √2 × Nyquist, stay empty).
 */
import { nyquistWavenumber, type WaveCascade } from "./waveCascade";
import type { WindSea } from "./jonswap";

/** Share of a grid's Nyquist wavenumber its band reaches: four texels per wave. */
export const BAND_NYQUIST_SHARE = 0.5;

/** One cascade's grid, before its band is chosen. */
export interface CascadeTile {
  tileMetres: number;
  /** Modes per side (a power of two). */
  size: number;
  /** Turn of the tile against the world, radians (WaveCascade.rotation). */
  rotation: number;
  seed: number;
}

/** The highest wavenumber a tile's band carries. */
export function bandTop({ size, tileMetres }: CascadeTile): number {
  return BAND_NYQUIST_SHARE * nyquistWavenumber(size, tileMetres);
}

/**
 * Cascades for `tiles` (largest first) that share `sea` and `windAngle` and
 * split its spectrum into contiguous, non-overlapping bands. Throws if a tile
 * is not fine enough to reach past the band before it.
 */
export function bandedCascades(sea: WindSea, windAngle: number, tiles: readonly CascadeTile[]): WaveCascade[] {
  let kMin = 0;
  return tiles.map((tile) => {
    const kMax = bandTop(tile);
    if (kMax <= kMin) {
      throw new Error(`A ${tile.tileMetres} m tile reaches only k = ${kMax}, inside the band before it (to ${kMin}).`);
    }
    const cascade: WaveCascade = { sea, windAngle, ...tile, kMin, kMax };
    kMin = kMax;
    return cascade;
  });
}
