import { describe, expect, it } from "vitest";
import { CARD_ART_MAX, cardArtProblems, webpSize } from "./cardArtCheck";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const le24 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

/** A WebP file's first bytes: the RIFF header and one chunk. */
const webp = (chunk: string, data: number[]) => {
  const body = [...data, ...new Array(16).fill(0)];
  return new Uint8Array([...ascii("RIFF"), ...le32(4 + 8 + body.length), ...ascii("WEBP"), ...ascii(chunk), ...le32(body.length), ...body]);
};

/** Lossy: a frame tag, the start code, then 14-bit width and height. */
const lossy = (w: number, h: number) => webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);
/** Lossless: the signature, then width − 1 and height − 1 in 14 bits each. */
const lossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return webp("VP8L", [0x2f, ...le32(bits)]);
};
/** Extended: flags, then width − 1 and height − 1 in 24 bits each. */
const extended = (w: number, h: number) => webp("VP8X", [0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

describe("reading a WebP's size (#247)", () => {
  it("reads lossy, lossless and extended WebP", () => {
    expect(webpSize(lossy(600, 800))).toEqual({ width: 600, height: 800 });
    expect(webpSize(lossless(768, 1024))).toEqual({ width: 768, height: 1024 });
    expect(webpSize(extended(672, 896))).toEqual({ width: 672, height: 896 });
  });

  it("is null for anything that is not a WebP", () => {
    expect(webpSize(new Uint8Array([0x89, ...ascii("PNG"), 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(webpSize(new Uint8Array(ascii("RIFF")))).toBeNull();
  });
});

describe("holding a card's art to the HUD (#247)", () => {
  it("bounds the art to a 256 CSS px frame at 3× density", () => {
    expect(CARD_ART_MAX).toEqual({ width: 768, height: 1024 });
  });

  it("passes 3:4 art within the bound, with a mask of its size", () => {
    expect(cardArtProblems("storm", lossy(600, 800), null)).toEqual([]);
    expect(cardArtProblems("lostFlag", lossy(768, 1024), lossless(768, 1024))).toEqual([]);
    expect(cardArtProblems("calmSeas", lossy(600, 801), null)).toEqual([]);
  });

  it("names what is wrong: not WebP, not 3:4, too large, a mask of another size", () => {
    expect(cardArtProblems("storm", new Uint8Array(12), null)).toEqual(["storm: not a WebP file"]);
    expect(cardArtProblems("storm", lossy(600, 600), null)).toEqual(["storm: 600×600 is not 3:4"]);
    expect(cardArtProblems("storm", lossy(900, 1200), null)).toEqual(["storm: 900×1200 is larger than 768×1024"]);
    expect(cardArtProblems("lostFlag", lossy(600, 800), lossless(300, 400))).toEqual(["lostFlag: its flag mask is 300×400, not 600×800"]);
    expect(cardArtProblems("lostFlag", lossy(600, 800), new Uint8Array(12))).toEqual(["lostFlag: its flag mask is not a WebP file"]);
  });
});
