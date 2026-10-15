import { describe, expect, it } from "vitest";
import { gpuInfoLines, readGpuContext, type GlContextPort } from "./gpuInfo";

const UNMASKED_VENDOR = 0x9245;
const UNMASKED_RENDERER = 0x9246;

function fakeContext(withDebugInfo: boolean): GlContextPort {
  const values = new Map<number, unknown>([
    [0x1f00, "WebKit"], // VENDOR
    [0x1f01, "WebKit WebGL"], // RENDERER
    [UNMASKED_VENDOR, "Google Inc. (Apple)"],
    [UNMASKED_RENDERER, "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)"],
    [0x8d57, 4], // MAX_SAMPLES
  ]);
  return {
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
    getParameter: (p: number) => values.get(p) ?? null,
    getExtension: (name: string) =>
      withDebugInfo && name === "WEBGL_debug_renderer_info" ? { UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR, UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER } : null,
    getContextAttributes: () => ({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }),
    drawingBufferWidth: 2160,
    drawingBufferHeight: 1350,
  };
}

describe("gpuInfo: what the GL context is, read from the screen (?gpuinfo=1)", () => {
  it("reads the full unmasked renderer and vendor when the browser gives them", () => {
    const info = readGpuContext(fakeContext(true), { webgl2: true, dpr: 1.5 });
    expect(info.unmaskedRenderer).toBe("ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)");
    expect(info.unmaskedVendor).toBe("Google Inc. (Apple)");
    expect(info).toMatchObject({
      renderer: "WebKit WebGL",
      vendor: "WebKit",
      webgl2: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      dpr: 1.5,
      drawingBuffer: [2160, 1350],
      maxSamples: 4,
    });
  });

  it("says when the unmasked strings are not available", () => {
    const info = readGpuContext(fakeContext(false), { webgl2: true, dpr: 1 });
    expect(info.unmaskedRenderer).toBeNull();
    expect(gpuInfoLines(info, null).join("\n")).toMatch(/unmasked renderer: \(not available\)/);
  });

  it("lists everything on its own line, the renderer string whole, and the live numbers once they come", () => {
    const info = readGpuContext(fakeContext(true), { webgl2: true, dpr: 1.5 });
    const waiting = gpuInfoLines(info, null);
    expect(waiting).toContain("unmasked renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)");
    expect(waiting).toContain("WebGL2: yes  antialias: yes  powerPreference: high-performance  preserveDrawingBuffer: no");
    expect(waiting).toContain("DPR 1.5  drawing buffer 2160 × 1350  max samples 4");
    expect(waiting).toContain("context lost 0  restored 0");
    const live = gpuInfoLines(info, {
      fps: 59.6,
      calls: 244,
      triangles: 5_810_000,
      geometries: 312,
      textures: 61,
      programs: 48,
      contextLost: 1,
      contextRestored: 1,
    });
    expect(live).toContain("fps 60  draws 244  tris 5.81 M");
    expect(live).toContain("geometries 312  textures 61  programs 48");
    expect(live).toContain("context lost 1  restored 1");
  });
});
