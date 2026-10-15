import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WebGLInfo, WebGLRenderer } from "three";
import { EMPTY_STATS_WINDOW, addFrame, isWindowFull, windowStats, type RenderStats } from "./renderStats";
import { readGpuContext, type GpuInfoFeed } from "./gpuInfo";

/**
 * `?gpuinfo=1`: reads the GL context and, once a frame, `renderer.info`
 * (reset here, so every pass of a frame counts, as `RenderStatsProbe` does;
 * it stands in for that probe, and hands `onStats` the same averages), and
 * counts the canvas's context losses and restores. Reports to `feed` every
 * half second. Draws nothing.
 */
export function GpuInfoProbe({ feed, onStats }: { feed: GpuInfoFeed; onStats?: (stats: RenderStats) => void }) {
  const gl = useThree((state) => state.gl);
  const pending = useRef(EMPTY_STATS_WINDOW);
  const losses = useRef({ lost: 0, restored: 0 });

  useEffect(() => {
    countEveryPass(gl.info, true);
    const canvas = gl.domElement;
    const lost = () => {
      losses.current.lost++;
    };
    const restored = () => {
      losses.current.restored++;
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      countEveryPass(gl.info, false);
    };
  }, [gl]);
  // The context's description shows at once, before the first frames are counted
  useEffect(() => report(gl, feed, losses.current, null), [gl, feed]);

  useFrame((_, delta) => {
    const { calls, triangles } = gl.info.render;
    gl.info.reset();
    pending.current = addFrame(pending.current, { seconds: delta, calls, triangles });
    if (!isWindowFull(pending.current)) return;
    const stats = windowStats(pending.current);
    pending.current = EMPTY_STATS_WINDOW;
    if (!stats) return;
    onStats?.(stats);
    report(gl, feed, losses.current, stats);
  });

  return null;
}

function report(gl: WebGLRenderer, feed: GpuInfoFeed, losses: { lost: number; restored: number }, stats: RenderStats | null) {
  const context = gl.getContext();
  const webgl2 = typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext;
  feed.publish({
    context: readGpuContext(context, { webgl2, dpr: gl.getPixelRatio() }),
    live: stats && {
      ...stats,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      contextLost: losses.lost,
      contextRestored: losses.restored,
    },
  });
}

/** Whether the renderer's counters run on across a frame's passes (reset by the probe) or restart with each render (three's default). */
function countEveryPass(info: WebGLInfo, on: boolean) {
  info.autoReset = !on;
  info.reset();
}
