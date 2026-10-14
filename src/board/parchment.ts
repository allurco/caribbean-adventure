/**
 * The parchment skin of the HUD's captain and ship cards (#164): the WCAG
 * contrast maths that holds its inks readable on its paper, and the torn
 * edge the sheet is cut to. Pure, no React.
 *
 * The colours themselves are Tailwind theme tokens in `src/index.css`
 * (`--color-parchment*` and `--color-ink*`), so the cards use plain classes
 * such as `bg-parchment` and `text-ink`; `parchmentTheme.node.test.ts` reads
 * them from there and holds every ink to WCAG AA on every paper.
 */
import { stream } from "./visuals/variationStream";

/** WCAG 2.x AA minimum contrast for body text (under 18.66 px bold / 24 px). */
export const WCAG_AA_TEXT = 4.5;

/** Parses `#rgb` or `#rrggbb` into 0–255 channels; null when it is not one. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((d) => d + d).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance of an sRGB colour given as 0–255 channels. */
export function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two `#hex` colours, from 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  if (!ca || !cb) throw new Error(`not a hex colour: ${ca ? b : a}`);
  const [hi, lo] = [relativeLuminance(ca), relativeLuminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The `--color-<name>: #hex;` declarations of a stylesheet whose name starts
 * with `prefix`, as a map from the name (without `--color-`) to the colour.
 */
export function themeColors(css: string, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,6})\s*;/gi;
  for (const m of css.matchAll(re)) {
    if (m[1].startsWith(prefix)) out[m[1]] = m[2];
  }
  return out;
}

/** How deep the tears bite into the sheet, in CSS pixels. Under the cards' 14 px padding. */
export const TORN_EDGE_DEPTH_PX = 4;
/** Points along each torn edge. */
const TORN_EDGE_TEETH = 48;
/** Fixed seed: the HUD is not part of the seeded world, so every game tears the same. */
const TORN_EDGE_SEED = 0x7a9c3e11;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A CSS `clip-path` polygon that tears the top and bottom edges of a box
 * raggedly, up to `depthPx` deep, and leaves its sides straight. The x
 * positions are percentages, so it fits any width; the bites are in pixels,
 * so they stay the same size on any height. Deterministic.
 */
export function tornEdgeClipPath(
  depthPx = TORN_EDGE_DEPTH_PX,
  teeth = TORN_EDGE_TEETH,
  seed = TORN_EDGE_SEED,
): string {
  const next = stream(seed);
  // A torn fibre wanders: each bite is half the last one plus half a fresh draw.
  let bite = next();
  const edge = () => {
    const pts: { x: number; d: number }[] = [];
    for (let i = 0; i <= teeth; i++) {
      bite = 0.5 * bite + 0.5 * next();
      pts.push({ x: round2((100 * i) / teeth), d: round2(bite * depthPx) });
    }
    return pts;
  };
  const top = edge().map(({ x, d }) => `${x}% ${d}px`);
  const bottom = edge()
    .reverse()
    .map(({ x, d }) => `${x}% calc(100% - ${d}px)`);
  return `polygon(${[...top, ...bottom].join(", ")})`;
}
