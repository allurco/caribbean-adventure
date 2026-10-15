import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WebGLInfo } from "three";
import { EMPTY_STATS_WINDOW, addFrame, isWindowFull, windowStats, type RenderStats } from "./renderStats";

/**
 * Reads `renderer.info` once a frame, inside the Canvas, and hands `onStats`
 * a window's averages (renderStats.ts) every half second. The renderer's
 * counters are reset here rather than by each render, so every pass of a
 * frame counts (shadows, the wave cascades, postprocessing), not only the
 * last. One reader per Canvas: a second would reset the counters under it.
 */
export function useFrameStats(onStats: (stats: RenderStats) => void): void {
  const gl = useThree((state) => state.gl);
  const pending = useRef(EMPTY_STATS_WINDOW);

  useEffect(() => {
    countEveryPass(gl.info, true);
    return () => countEveryPass(gl.info, false);
  }, [gl]);

  useFrame((_, delta) => {
    const { calls, triangles } = gl.info.render;
    gl.info.reset();
    pending.current = addFrame(pending.current, { seconds: delta, calls, triangles });
    if (!isWindowFull(pending.current)) return;
    const stats = windowStats(pending.current);
    pending.current = EMPTY_STATS_WINDOW;
    if (stats) onStats(stats);
  });
}

/** Whether the renderer's counters run on across a frame's passes (reset by the reader) or restart with each render (three's default). */
function countEveryPass(info: WebGLInfo, on: boolean) {
  info.autoReset = !on;
  info.reset();
}
