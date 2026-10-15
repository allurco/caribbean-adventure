/**
 * The loading screen: shown while the map is generated off the main thread
 * (#124), and over the board until its scene is ready (useSceneReadiness.ts),
 * with the stage and a bar. Static apart from the bar's width, so there is
 * nothing to tone down for reduced motion.
 */
export function MapLoadingScreen({ stage, fraction }: { stage?: string; fraction?: number }) {
  const percent = Math.round((fraction ?? 0) * 100);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-[#0a1929]" role="status" aria-live="polite">
      <p className="font-heading text-sm tracking-[0.3em] text-amber-200/70 uppercase">Charting the seas…</p>
      <div
        className="h-1 w-56 overflow-hidden rounded-full bg-amber-200/15"
        role="progressbar"
        aria-label="Loading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-amber-200/70 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="font-body text-xs tracking-[0.2em] text-amber-200/50 uppercase">{stage ?? "Drawing the map"}</p>
    </div>
  );
}
