/**
 * Is this a phone held upright (#123)? Caribbean Merchant is landscape-only
 * on phones, so a phone in portrait gets the rotate gate. Pure, no React;
 * `usePortraitPhone` feeds it the screen and the window.
 *
 * Whether it is a phone is the device's: a coarse (touch) primary pointer on
 * a screen whose short side is at most PHONE_MAX_SHORT_SIDE CSS px. The
 * largest phones are about 430 px across, a Fold's cover screen about 344,
 * its inner screen about 673 and the smallest tablets 744. It goes by the
 * screen, not the window, so an iPad in Slide Over or Split View, or an
 * Android tablet in multi-window, is never taken for a phone however narrow
 * its window, and a desktop with a touchscreen never is. iOS reports the
 * screen as if upright whichever way it is held; the short side does not care.
 *
 * Whether it is upright is the window's: height ≥ width, as in the CSS
 * `orientation` media feature.
 */

export const PHONE_MAX_SHORT_SIDE = 540;

export interface ViewportSample {
  /** `screen.width` and `screen.height`, in CSS px. */
  screenWidth: number;
  screenHeight: number;
  /** The window: `innerWidth` and `innerHeight`. */
  width: number;
  height: number;
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarse: boolean;
}

/** A touch device whose screen is no bigger than a phone's, whichever way it is held. */
export function isPhone({ screenWidth, screenHeight, coarse }: ViewportSample): boolean {
  return coarse && Math.min(screenWidth, screenHeight) <= PHONE_MAX_SHORT_SIDE;
}

export function isPortraitPhone(viewport: ViewportSample): boolean {
  return isPhone(viewport) && viewport.height >= viewport.width;
}
