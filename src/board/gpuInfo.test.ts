import { describe, expect, it } from "vitest";
import { createGpuContextReader, gpuInfoLines, gpuLiveInfo, gpuSetupLines, type GlContextPort } from "./gpuInfo";
import { canvasSetup } from "./canvasSetup";

const UNMASKED_VENDOR = 0x9245;
const UNMASKED_RENDERER = 0x9246;
const RENDERER_STRING = "ANGLE (Vendor, Example Renderer, Unspecified Version)";

function fakeContext(withDebugInfo: boolean): GlContextPort & { reads: number; drawingBufferWidth: number; drawingBufferHeight: number } {
  const values = new Map<number, unknown>([
    [0x1f00, "WebKit"], // VENDOR
    [0x1f01, "WebKit WebGL"], // RENDERER
    [UNMASKED_VENDOR, "Example Vendor"],
    [UNMASKED_RENDERER, RENDERER_STRING],
    [0x8d57, 4], // MAX_SAMPLES
  ]);
  const fake = {
    reads: 0,
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
    getParameter: (p: number) => {
      fake.reads++;
      return values.get(p) ?? null;
    },
    getExtension: (name: string) =>
      withDebugInfo && name === "WEBGL_debug_renderer_info" ? { UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR, UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER } : null,
    getContextAttributes: () => {
      fake.reads++;
      return { antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false };
    },
    drawingBufferWidth: 2160,
    drawingBufferHeight: 1350,
  };
  return fake;
}

describe("gpuInfo: what the GL context is, read from the screen (?gpuinfo=1)", () => {
  it("reads the full unmasked renderer and vendor when the browser gives them", () => {
    const info = createGpuContextReader(fakeContext(true), true)(1.5);
    expect(info.unmaskedRenderer).toBe(RENDERER_STRING);
    expect(info.unmaskedVendor).toBe("Example Vendor");
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

  it("reads the fixed values once per context, and only the size and DPR again", () => {
    const gl = fakeContext(true);
    const read = createGpuContextReader(gl, true);
    const reads = gl.reads;
    gl.drawingBufferWidth = 1440;
    gl.drawingBufferHeight = 900;
    const again = read(1);
    expect(gl.reads).toBe(reads);
    expect(again.dpr).toBe(1);
    expect(again.drawingBuffer).toEqual([1440, 900]);
    expect(again.unmaskedRenderer).toBe(RENDERER_STRING);
  });

  it("says when the unmasked strings are not available", () => {
    const info = createGpuContextReader(fakeContext(false), true)(1);
    expect(info.unmaskedRenderer).toBeNull();
    expect(gpuInfoLines(info, null).join("\n")).toMatch(/unmasked renderer: \(not available\)/);
  });

  it("lists everything on its own line, the renderer string whole, and the live numbers once they come", () => {
    const info = createGpuContextReader(fakeContext(true), true)(1.5);
    const waiting = gpuInfoLines(info, null);
    expect(waiting).toContain(`unmasked renderer: ${RENDERER_STRING}`);
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

  it("puts the frame's averages, the renderer's memory and the context's losses together", () => {
    const stats = { fps: 60, calls: 244, triangles: 5_810_000 };
    const info = { memory: { geometries: 312, textures: 61 }, programs: new Array(48) };
    expect(gpuLiveInfo(stats, info, { lost: 2, restored: 1 })).toEqual({
      ...stats,
      geometries: 312,
      textures: 61,
      programs: 48,
      contextLost: 2,
      contextRestored: 1,
    });
    expect(gpuLiveInfo(stats, { ...info, programs: null }, { lost: 0, restored: 0 }).programs).toBe(0);
  });

  it("shows the switches in effect, never the rest of the URL, and the set-up they gave", () => {
    const setup = canvasSetup({ dpr1: true, info: true }, { msaa: true, shadows: true });
    expect(gpuSetupLines({ dpr1: true, info: true }, { msaa: true, shadows: true }, setup)).toEqual([
      "switches: shadows=0 aa=0 dpr=1 gpuinfo=1",
      "asked: dpr 1  shadows off  composer multisampling 0",
    ]);
    expect(gpuSetupLines({ info: true }, { postProcessing: true }, canvasSetup({ info: true }, { postProcessing: true }))).toEqual([
      "switches: post=0 gpuinfo=1",
      "asked: dpr 1–1.5  shadows on  composer multisampling (no composer)",
    ]);
  });
});
