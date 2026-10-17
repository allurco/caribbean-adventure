/**
 * Holds the event cards' art files to what the HUD needs (#247): real WebP,
 * 3:4 within a pixel, no larger than `CARD_ART_MAX`, and a flag mask the
 * size of its art. Read off disk by cardArtFiles.node.test.ts. Pure.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The largest art the HUD needs: the card frame is at most 256 CSS px wide
 * (16rem, eventCardStyles.ts), shown at up to 3 device pixels per CSS pixel,
 * so 768 × 1024. The 896 × 1200 the art is made at is scaled down to fit.
 */
export const CARD_ART_MAX: ImageSize = { width: 768, height: 1024 };

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32 = (b: Uint8Array, at: number) => (u24(b, at) | (b[at + 3] << 24)) >>> 0;

/** A WebP file's size in pixels, from its first chunk; null when `bytes` is not a WebP. */
export function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  switch (ascii(bytes, 12, 4)) {
    case "VP8 ":
      // A lossy frame: a 3-byte frame tag, the start code 9d 01 2a, then 14-bit sizes
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      return { width: u16(bytes, 26) & 0x3fff, height: u16(bytes, 28) & 0x3fff };
    case "VP8L": {
      // Lossless: the signature 2f, then width − 1 and height − 1 in 14 bits each
      if (bytes[20] !== 0x2f) return null;
      const bits = u32(bytes, 21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case "VP8X":
      // Extended: 4 bytes of flags, then width − 1 and height − 1 in 24 bits each
      return { width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1 };
    default:
      return null;
  }
}

const sized = ({ width, height }: ImageSize) => `${width}×${height}`;

/** What is wrong with the art of `slot` and its flag mask, if it has one; empty when nothing is. */
export function cardArtProblems(slot: string, art: Uint8Array, mask: Uint8Array | null): string[] {
  const size = webpSize(art);
  if (!size) return [`${slot}: not a WebP file`];
  const problems: string[] = [];
  // 3:4 within a pixel: the height a 3:4 picture of this width has, give or take one
  if (Math.abs((size.width * 4) / 3 - size.height) > 1) problems.push(`${slot}: ${sized(size)} is not 3:4`);
  if (size.width > CARD_ART_MAX.width || size.height > CARD_ART_MAX.height) {
    problems.push(`${slot}: ${sized(size)} is larger than ${sized(CARD_ART_MAX)}`);
  }
  if (mask) {
    const maskSize = webpSize(mask);
    if (!maskSize) problems.push(`${slot}: its flag mask is not a WebP file`);
    else if (maskSize.width !== size.width || maskSize.height !== size.height) {
      problems.push(`${slot}: its flag mask is ${sized(maskSize)}, not ${sized(size)}`);
    }
  }
  return problems;
}
