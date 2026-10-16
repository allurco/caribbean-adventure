/**
 * Is this a phone held upright (#123)? Caribbean Merchant is landscape-only
 * on phones, so a phone in portrait gets the rotate gate. Pure, no React;
 * `usePortraitPhone` feeds it the window.
 *
 * A phone is a coarse (touch) primary pointer whose short side is at most
 * PHONE_MAX_SHORT_SIDE CSS px: the largest phones are about 430 px across,
 * the smallest tablets 744. A desktop window has a fine pointer and is never
 * a phone, however narrow. Portrait is height ≥ width, as in the CSS
 * `orientation` media feature.
 */

export const PHONE_MAX_SHORT_SIDE = 540;

export interface ViewportSample {
  width: number;
  height: number;
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarse: boolean;
}

/** A touch screen no wider than a phone, either way up. */
export function isPhone({ width, height, coarse }: ViewportSample): boolean {
  return coarse && Math.min(width, height) <= PHONE_MAX_SHORT_SIDE;
}

export function isPortraitPhone(viewport: ViewportSample): boolean {
  return isPhone(viewport) && viewport.height >= viewport.width;
}
