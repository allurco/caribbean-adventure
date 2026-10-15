import type { RenderStats } from "./renderStats";
import { useFrameStats } from "./useFrameStats";

/**
 * Dev `stats=1` (#162): hands `onStats` the frame's averages every half
 * second (useFrameStats.ts), counting every pass of a frame. Draws nothing.
 */
export function RenderStatsProbe({ onStats }: { onStats: (stats: RenderStats) => void }) {
  useFrameStats(onStats);
  return null;
}
