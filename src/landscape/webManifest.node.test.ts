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

/** The SVG icon is a few shapes; the PNGs are painted art, downscaled and palette-compressed. */
const SVG_ICON_BUDGET = 8 * 1024;
const PNG_ICON_BUDGET = 128 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG colour types with an alpha channel: grey + alpha, RGBA. */
const ALPHA_COLOUR_TYPES = [4, 6];

/** Width, height and colour type from a PNG's IHDR chunk, which always follows the signature. */
function pngHeader(bytes: Buffer): { width: number; height: number; colourType: number } {
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
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
      const budget = icon.type === "image/png" ? PNG_ICON_BUDGET : SVG_ICON_BUDGET;
      expect(statSync(file).size, icon.src).toBeLessThan(budget);
    }
  });

  it("keeps the SVG icon and offers 192 and 512 PNGs for any purpose, and a 512 maskable one", () => {
    const icons = readManifest().icons ?? [];
    expect(icons).toContainEqual(expect.objectContaining({ src: "/icon.svg", type: "image/svg+xml" }));
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
    const bytes = readFileSync(publicFile(href ?? "/apple-touch-icon.png"));
    const { width, height, colourType } = pngHeader(bytes);
    expect([width, height]).toEqual([180, 180]);
    expect(ALPHA_COLOUR_TYPES).not.toContain(colourType);
    // A palette or truecolour PNG can still carry transparency in a tRNS chunk.
    expect(bytes.includes("tRNS")).toBe(false);
    expect(statSync(publicFile(href ?? "/apple-touch-icon.png")).size).toBeLessThan(PNG_ICON_BUDGET);
  });
});

describe("the viewport", () => {
  it("covers the whole screen, notch included, so the HUD can pad by the safe areas", () => {
    const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(viewport.split(",").map((part) => part.trim())).toContain("viewport-fit=cover");
  });
});
