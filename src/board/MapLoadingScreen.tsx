/**
 * Shown while the map is generated off the main thread (#124), in place of
 * an empty board. Static, so there is nothing to tone down for reduced motion.
 */
export function MapLoadingScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a1929]" role="status" aria-live="polite">
      <p className="font-heading text-sm tracking-[0.3em] text-amber-200/70 uppercase">Charting the seas…</p>
    </div>
  );
}
