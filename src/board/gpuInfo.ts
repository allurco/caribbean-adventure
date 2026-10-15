import { formatCount, type RenderStats } from "./renderStats";
import { renderSwitches, type GpuCheck, type RenderOff } from "./devUrlParams";
import type { CanvasSetup } from "./canvasSetup";

/**
 * `?gpuinfo=1`: what the board's GL context is and what its frames cost,
 * written out to read from the screen or a screenshot, on a machine whose
 * console the reporter cannot easily share. Pure; `GpuInfoProbe` reads the
 * context and `GpuInfoOverlay` shows these lines.
 */

/** The parts of a WebGL context read here, so tests can fake it. */
export interface GlContextPort {
  readonly VENDOR: number;
  readonly RENDERER: number;
  getParameter(name: number): unknown;
  getExtension(name: string): unknown;
  getContextAttributes(): { antialias?: boolean; powerPreference?: string; preserveDrawingBuffer?: boolean } | null;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
}

/** What the context is: fixed once it is made. */
export interface GpuContextInfo {
  renderer: string;
  vendor: string;
  /** From WEBGL_debug_renderer_info, whole; null where the browser does not give it. */
  unmaskedRenderer: string | null;
  unmaskedVendor: string | null;
  webgl2: boolean;
  antialias: boolean;
  powerPreference: string;
  preserveDrawingBuffer: boolean;
  dpr: number;
  drawingBuffer: [number, number];
  maxSamples: number | null;
}

/** What the frames cost, and the context's losses, refreshed while the board runs. */
export interface GpuLiveInfo {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  contextLost: number;
  contextRestored: number;
}

const MAX_SAMPLES = 0x8d57;

interface DebugRendererInfo {
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));

/**
 * A reader of `gl`'s description: the strings, attributes and limits are
 * read once, here, as they are fixed for the context; each call reads only
 * the drawing buffer's size and takes the `dpr` in use.
 */
export function createGpuContextReader(gl: GlContextPort, webgl2: boolean): (dpr: number) => GpuContextInfo {
  const debug = gl.getExtension("WEBGL_debug_renderer_info") as DebugRendererInfo | null;
  const attributes = gl.getContextAttributes() ?? {};
  const samples = webgl2 ? gl.getParameter(MAX_SAMPLES) : null;
  const fixed = {
    renderer: text(gl.getParameter(gl.RENDERER)),
    vendor: text(gl.getParameter(gl.VENDOR)),
    unmaskedRenderer: debug ? text(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    unmaskedVendor: debug ? text(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
    webgl2,
    antialias: attributes.antialias === true,
    powerPreference: attributes.powerPreference ?? "default",
    preserveDrawingBuffer: attributes.preserveDrawingBuffer === true,
    maxSamples: typeof samples === "number" ? samples : null,
  };
  return (dpr) => ({ ...fixed, dpr, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] });
}

/** The parts of three's `renderer.info` read here. */
export interface RendererInfoPort {
  memory: { geometries: number; textures: number };
  programs?: readonly unknown[] | null;
}

/** The live numbers: a window's frame averages, the renderer's memory and programs, and the context's losses and restores. */
export function gpuLiveInfo(stats: RenderStats, info: RendererInfoPort, losses: { lost: number; restored: number }): GpuLiveInfo {
  return {
    ...stats,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    contextLost: losses.lost,
    contextRestored: losses.restored,
  };
}

/** The readout's last lines: the switches in effect (`renderSwitches`, not the whole query) and the set-up they asked for. */
export function gpuSetupLines(gpu: GpuCheck, off: RenderOff, setup: CanvasSetup): string[] {
  const switches = renderSwitches(off, gpu);
  const dpr = Array.isArray(setup.dpr) ? setup.dpr.join("–") : `${setup.dpr}`;
  const composer = off.postProcessing ? "(no composer)" : `${setup.composerMultisampling}`;
  const bloom = off.postProcessing
    ? "(no composer)"
    : [
        ...(off.bloom ? ["off"] : [off.bloomSanitize ? "input not sanitized" : "input sanitized", off.bloomMipmapBlur ? "no mipmap blur" : "mipmap blur"]),
        `buffers ${setup.composerFrameBuffer === "float" ? "float" : "half float"}`,
      ].join("  ");
  return [
    `switches: ${switches.length > 0 ? switches.join(" ") : "(none)"}`,
    `asked: dpr ${dpr}  shadows ${setup.shadows ? "on" : "off"}  composer multisampling ${composer}`,
    `bloom: ${bloom}`,
  ];
}

const yesNo = (on: boolean) => (on ? "yes" : "no");

/** The overlay's lines; the live ones show dashes until `live` comes. */
export function gpuInfoLines(info: GpuContextInfo, live: GpuLiveInfo | null): string[] {
  return [
    `unmasked renderer: ${info.unmaskedRenderer ?? "(not available)"}`,
    `unmasked vendor: ${info.unmaskedVendor ?? "(not available)"}`,
    `renderer: ${info.renderer}  vendor: ${info.vendor}`,
    `WebGL2: ${yesNo(info.webgl2)}  antialias: ${yesNo(info.antialias)}  powerPreference: ${info.powerPreference}  preserveDrawingBuffer: ${yesNo(info.preserveDrawingBuffer)}`,
    `DPR ${info.dpr}  drawing buffer ${info.drawingBuffer[0]} × ${info.drawingBuffer[1]}  max samples ${info.maxSamples ?? "–"}`,
    live ? `fps ${live.fps.toFixed(0)}  draws ${formatCount(live.calls)}  tris ${formatCount(live.triangles)}` : "fps –  draws –  tris –",
    live ? `geometries ${live.geometries}  textures ${live.textures}  programs ${live.programs}` : "geometries –  textures –  programs –",
    `context lost ${live?.contextLost ?? 0}  restored ${live?.contextRestored ?? 0}`,
  ];
}

/** What the probe hands the overlay every half second. */
export interface GpuInfoReport {
  context: GpuContextInfo;
  live: GpuLiveInfo | null;
}

/** Carries the probe's reports (inside the Canvas) to the overlay (outside it), like `RenderStatsFeed`. */
export interface GpuInfoFeed {
  readonly publish: (report: GpuInfoReport) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly latest: () => GpuInfoReport | null;
}

export function createGpuInfoFeed(): GpuInfoFeed {
  let current: GpuInfoReport | null = null;
  const listeners = new Set<() => void>();
  return {
    publish: (report) => {
      current = report;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    latest: () => current,
  };
}
