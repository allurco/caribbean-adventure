/**
 * Is this a touch phone, and which way is it held? The game is landscape-only
 * on phones (#104): portrait gets the rotate gate, landscape gets the compact
 * layout. Pure so it can be tested; usePhoneOrientation feeds it the window.
 *
 * A phone is a coarse (touch) primary pointer whose short side is at most
 * PHONE_MAX_SHORT_SIDE CSS px: the largest phones are about 430 px across,
 * the smallest tablets 744. A desktop window, however narrow, has a fine
 * pointer and is never a phone. Portrait is height >= width, as in the CSS
 * `orientation` media feature, so the `phl:` variant in index.css agrees.
 */

export const PHONE_MAX_SHORT_SIDE = 540;

export interface ViewportSample {
  width: number;
  height: number;
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarse: boolean;
}

export type PhoneOrientation = "portrait" | "landscape";

/** "portrait" or "landscape" on a phone, null on anything else. */
export function phoneOrientation({ width, height, coarse }: ViewportSample): PhoneOrientation | null {
  if (!coarse || Math.min(width, height) > PHONE_MAX_SHORT_SIDE) return null;
  return height >= width ? "portrait" : "landscape";
}

export const isPortraitPhone = (v: ViewportSample): boolean => phoneOrientation(v) === "portrait";
export const isLandscapePhone = (v: ViewportSample): boolean => phoneOrientation(v) === "landscape";
