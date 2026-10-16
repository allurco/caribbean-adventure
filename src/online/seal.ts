/**
 * A captain's wax seal (#125): their initials pressed into a wax picked from
 * their account id, so a captain keeps one colour on every screen and every
 * device. Shown where the sign-in provider gave no avatar. Pure, no React.
 */

/** Dark period waxes; the seal's letters are pale on all of them. */
export const SEAL_WAXES: readonly string[] = ["#8a2617", "#6b3a8a", "#1f5a6e", "#2f5a23", "#7a5212", "#5a1f3a", "#283f7a", "#6e3b1f"];

export interface Seal {
  initials: string;
  wax: string;
}

export function sealFor(id: string, displayName: string): Seal {
  return { initials: initials(displayName), wax: SEAL_WAXES[hash(id) % SEAL_WAXES.length] };
}

/** The first letters of the first and last words, upper case. */
function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + last).toUpperCase();
}

/** FNV-1a, 32 bits: stable and spread enough to pick a wax. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
