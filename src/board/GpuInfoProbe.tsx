import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { RenderStats } from "./renderStats";
import { createGpuContextReader, gpuLiveInfo, type GpuInfoFeed } from "./gpuInfo";
import { useFrameStats } from "./useFrameStats";

/**
 * `?gpuinfo=1`: describes the GL context (its fixed values read once,
 * gpuInfo.ts), takes the frame's averages (useFrameStats.ts; it stands in
 * for `RenderStatsProbe`, and hands `onStats` the same averages), and counts
 * the canvas's context losses and restores. Reports to `feed` every half
 * second. Draws nothing.
 */
export function GpuInfoProbe({ feed, onStats }: { feed: GpuInfoFeed; onStats?: (stats: RenderStats) => void }) {
  const gl = useThree((state) => state.gl);
  const losses = useRef({ lost: 0, restored: 0 });
  const describe = useMemo(() => {
    const context = gl.getContext();
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext;
    return createGpuContextReader(context, webgl2);
  }, [gl]);

  useEffect(() => {
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
    };
  }, [gl]);

  // The context's description shows at once, before the first frames are counted
  useEffect(() => feed.publish({ context: describe(gl.getPixelRatio()), live: null }), [gl, feed, describe]);

  useFrameStats((stats) => {
    onStats?.(stats);
    feed.publish({ context: describe(gl.getPixelRatio()), live: gpuLiveInfo(stats, gl.info, losses.current) });
  });

  return null;
}
