import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Phones play in landscape (#123): the page asks for it through its web
// manifest and lays itself out under the notch, padding by the safe areas.
const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const html = readFileSync(root("index.html"), "utf8");

const manifestHref = /<link\s+rel="manifest"\s+href="\/([^"]+)"/.exec(html)?.[1];

interface Manifest {
  name: string;
  display: string;
  orientation: string;
  icons?: { src: string }[];
}

describe("the web manifest", () => {
  it("is linked from the page and served from public/", () => {
    expect(manifestHref).toBeDefined();
    expect(existsSync(root(`public/${manifestHref}`))).toBe(true);
  });

  it("names the game and asks for full screen, in landscape", () => {
    const manifest = JSON.parse(readFileSync(root(`public/${manifestHref}`), "utf8")) as Manifest;
    expect(manifest).toMatchObject({ name: "Caribbean Merchant", display: "fullscreen", orientation: "landscape" });
  });

  it("points only at small icons that exist", () => {
    const manifest = JSON.parse(readFileSync(root(`public/${manifestHref}`), "utf8")) as Manifest;
    for (const icon of manifest.icons ?? []) {
      const file = root(`public/${icon.src.replace(/^\//, "")}`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(8 * 1024);
    }
  });
});

describe("the viewport", () => {
  it("covers the whole screen, notch included, so the HUD can pad by the safe areas", () => {
    const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(viewport.split(",").map((part) => part.trim())).toContain("viewport-fit=cover");
  });
});
