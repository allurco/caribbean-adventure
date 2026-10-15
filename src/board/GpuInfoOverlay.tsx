import { useSyncExternalStore } from "react";
import { gpuInfoLines, type GpuInfoFeed } from "./gpuInfo";

/**
 * `?gpuinfo=1`: the GL context and its frames written out over the board,
 * to read from the screen or a screenshot (gpuInfo.ts), with the switches
 * the page was opened with and the set-up they gave.
 */
export function GpuInfoOverlay({ feed, setupLines }: { feed: GpuInfoFeed; setupLines: readonly string[] }) {
  const report = useSyncExternalStore(feed.subscribe, feed.latest);
  const lines = report ? gpuInfoLines(report.context, report.live) : ["reading the GL context…"];
  return (
    <div
      data-testid="gpu-info"
      className="absolute bottom-3 left-3 z-50 max-w-[calc(100vw-1.5rem)] px-2 py-1 rounded bg-black/75 text-white font-mono text-[11px] leading-snug whitespace-pre-wrap break-all pointer-events-none"
    >
      {[...lines, ...setupLines].join("\n")}
    </div>
  );
}
