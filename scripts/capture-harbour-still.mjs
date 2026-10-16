// Captures the harbour backdrop's still (#122) from its live scene, the same
// fixed camera the online shell's backdrop fades in from. Repeatable: same
// map, same camera, waves held at their first moment. See docs/harbour-still.md.
//
//   npm run capture:harbour
//
// Starts a Vite dev server, opens `?view=harbour` (the scene alone) in
// headless Chromium on the GPU at the still's size, waits for the scene's
// settled frame, and writes:
//   public/harbour/harbour-still.webp   the still
//   src/online/harbourStillImage.ts          its path, its inlined blurred placeholder and the view it was captured from
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// The still's size, as in src/board/harbour/harbourView.ts (STILL_WIDTH, STILL_HEIGHT); harbourStillImage.test.ts holds the two together.
const WIDTH = 2400;
const HEIGHT = 1000;
const STILL_PATH = "harbour/harbour-still.webp";
const STILL_QUALITY = 0.82;
// The placeholder: a few hundred bytes, shown blurred.
const PLACEHOLDER_WIDTH = 32;
const PLACEHOLDER_QUALITY = 0.4;
const SETTLE_TIMEOUT_MS = 180_000;

const server = await createServer({ root: ROOT, server: { port: 5190, strictPort: false }, logLevel: "warn" });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("the dev server has no local URL");

// Headless Chromium on the machine's GPU (docs/agents/visual-checks-ledger.md); SwiftShader where there is none.
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") console.log(`[page] ${message.text()}`);
  });
  await page.goto(`${base}?view=harbour`);
  await page.waitForFunction(() => ["settled", "failed"].includes(document.documentElement.dataset.harbour ?? ""), null, {
    timeout: SETTLE_TIMEOUT_MS,
  });
  const state = await page.evaluate(() => document.documentElement.dataset.harbour);
  if (state !== "settled") throw new Error(`the harbour scene did not settle (${state})`);

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log(`renderer: ${renderer}`);

  const png = await page.screenshot({ type: "png" });
  // Encode in the page: Chromium writes WebP, so the script needs no image library.
  const encoded = await page.evaluate(
    async ({ png, width, height, stillQuality, placeholderWidth, placeholderQuality }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const encode = (w, h, quality) => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, w, h);
        return canvas.toDataURL("image/webp", quality);
      };
      const placeholderHeight = Math.round((placeholderWidth * height) / width);
      return { still: encode(width, height, stillQuality), placeholder: encode(placeholderWidth, placeholderHeight, placeholderQuality) };
    },
    { png: png.toString("base64"), width: WIDTH, height: HEIGHT, stillQuality: STILL_QUALITY, placeholderWidth: PLACEHOLDER_WIDTH, placeholderQuality: PLACEHOLDER_QUALITY }
  );
  const view = JSON.parse(await page.evaluate(() => document.documentElement.dataset.harbourView ?? "null"));

  const still = Buffer.from(encoded.still.replace(/^data:image\/webp;base64,/, ""), "base64");
  await mkdir(new URL(`../public/harbour/`, import.meta.url), { recursive: true });
  await writeFile(new URL(`../public/${STILL_PATH}`, import.meta.url), still);
  await writeFile(
    new URL("../src/online/harbourStillImage.ts", import.meta.url),
    `// Written by scripts/capture-harbour-still.mjs (npm run capture:harbour); re-capture rather than edit (docs/harbour-still.md).

/** The harbour backdrop's still (#122): where it is served from under the app's base, its inlined placeholder and the view it was captured from. */
export const HARBOUR_STILL = {
  path: ${JSON.stringify(STILL_PATH)},
  placeholder: ${JSON.stringify(encoded.placeholder)},
  capturedWith: ${JSON.stringify(view)},
} as const;
`
  );
  console.log(`wrote public/${STILL_PATH} (${(still.length / 1024).toFixed(0)} KB) and src/online/harbourStillImage.ts (placeholder ${encoded.placeholder.length} B)`);
} finally {
  await browser.close();
  await server.close();
}
