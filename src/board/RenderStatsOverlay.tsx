import { useSyncExternalStore } from "react";
import { formatCount, type RenderStatsFeed } from "./renderStats";

/** Dev `stats=1` (#162): the corner readout of what `RenderStatsProbe` measured, or dashes until it reports. */
export function RenderStatsOverlay({ feed }: { feed: RenderStatsFeed }) {
  const stats = useSyncExternalStore(feed.subscribe, feed.latest);
  return (
    <div
      data-testid="render-stats"
      className="absolute top-24 left-5 z-50 px-2 py-1 rounded bg-black/60 text-white font-mono text-xs whitespace-pre pointer-events-none"
    >
      {stats
        ? `fps ${stats.fps.toFixed(0)}  draws ${formatCount(stats.calls)}  tris ${formatCount(stats.triangles)}`
        : "fps –  draws –  tris –"}
    </div>
  );
}
