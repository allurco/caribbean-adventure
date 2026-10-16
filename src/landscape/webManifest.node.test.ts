import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Phones play in landscape (#123): the page asks for it through its web
// manifest and lays itself out under the notch, padding by the safe areas.
const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const html = readFileSync(root("index.html"), "utf8");

const manifestHref = /<link\s+rel="manifest"\s+href="\/([^"]+)"/.exec(html)?.[1];

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface Manifest {
  name: string;
  display: string;
  orientation: string;
  icons?: ManifestIcon[];
}

const publicFile = (src: string) => root(`public/${src.replace(/^\//, "")}`);
const readManifest = () => JSON.parse(readFileSync(root(`public/${manifestHref}`), "utf8")) as Manifest;

/** The icons are painted art, downscaled and compressed; small enough for an install, never a payload. */
const ICON_BUDGET = 128 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG colour types with an alpha channel: grey + alpha, RGBA. */
const ALPHA_COLOUR_TYPES = [4, 6];

interface PngChunk {
  type: string;
  data: Buffer;
}

/** A PNG's chunks in order, walked from just after the signature. */
function pngChunks(bytes: Buffer): PngChunk[] {
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  const chunks: PngChunk[] = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    chunks.push({ type: bytes.toString("ascii", offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length; // length, type, data, CRC
  }
  return chunks;
}

/** Width, height and colour type from a PNG's IHDR chunk, which always comes first. */
function pngHeader(bytes: Buffer): { width: number; height: number; colourType: number } {
  const [ihdr] = pngChunks(bytes);
  expect(ihdr.type).toBe("IHDR");
  return { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), colourType: ihdr.data[9] };
}

describe("the web manifest", () => {
  it("is linked from the page and served from public/", () => {
    expect(manifestHref).toBeDefined();
    expect(existsSync(root(`public/${manifestHref}`))).toBe(true);
  });

  it("names the game and asks for full screen, in landscape", () => {
    expect(readManifest()).toMatchObject({ name: "Caribbean Merchant", display: "fullscreen", orientation: "landscape" });
  });

  it("points only at small icons that exist", () => {
    for (const icon of readManifest().icons ?? []) {
      const file = publicFile(icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      expect(statSync(file).size, icon.src).toBeLessThan(ICON_BUDGET);
    }
  });

  it("offers only PNGs of the one artwork: 192 and 512 for any purpose, and a 512 maskable one", () => {
    const icons = readManifest().icons ?? [];
    expect(icons.map((icon) => icon.type)).toEqual(icons.map(() => "image/png"));
    const pngs = icons.filter((icon) => icon.type === "image/png").map((icon) => `${icon.sizes} ${icon.purpose}`);
    expect(pngs).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
  });

  it("states each PNG icon's real pixel size", () => {
    for (const icon of (readManifest().icons ?? []).filter((each) => each.type === "image/png")) {
      const { width, height } = pngHeader(readFileSync(publicFile(icon.src)));
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });
});

describe("the apple-touch-icon", () => {
  const href = /<link\s+rel="apple-touch-icon"\s+href="([^"]+)"/.exec(html)?.[1];

  it("is linked from the page", () => {
    expect(href).toBe("/apple-touch-icon.png");
  });

  it("is an opaque 180x180 PNG, since iOS fills any transparency with black", () => {
    expect(href).toBeDefined();
    const file = publicFile(href as string);
    const bytes = readFileSync(file);
    const { width, height, colourType } = pngHeader(bytes);
    expect([width, height]).toEqual([180, 180]);
    expect(ALPHA_COLOUR_TYPES).not.toContain(colourType);
    // A palette or truecolour PNG can still carry transparency in a tRNS chunk.
    expect(pngChunks(bytes).map((chunk) => chunk.type)).not.toContain("tRNS");
    expect(statSync(file).size).toBeLessThan(ICON_BUDGET);
  });
});

describe("the favicon", () => {
  const link = /<link\s+rel="icon"\s+type="([^"]+)"\s+href="([^"]+)"/.exec(html);

  it("is the same painted art as the manifest's icons, as a small PNG", () => {
    expect(link?.slice(1)).toEqual(["image/png", "/favicon-48.png"]);
    const { width, height } = pngHeader(readFileSync(publicFile("/favicon-48.png")));
    expect([width, height]).toEqual([48, 48]);
  });
});

describe("the viewport", () => {
  it("covers the whole screen, notch included, so the HUD can pad by the safe areas", () => {
    const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(viewport.split(",").map((part) => part.trim())).toContain("viewport-fit=cover");
  });
});
