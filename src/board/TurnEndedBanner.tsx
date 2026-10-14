/**
 * The "turn ends" beat between turns (#216): a parchment slip with the
 * outgoing captain's name that fades in and out over the beat. Under reduced
 * motion it only fades, and for less time (turnHandoff.ts).
 */
export function TurnEndedBanner({ captainName, reducedMotion }: { captainName: string; reducedMotion: boolean }) {
  return (
    <div className="fixed inset-x-0 top-1/3 z-40 flex justify-center pointer-events-none">
      <div
        className={`px-6 py-3 rounded-md border border-ink/25 bg-parchment/95 text-ink text-center shadow-[0_6px_16px_rgba(0,0,0,0.45)] opacity-0 ${
          reducedMotion ? "animate-turn-ended-still" : "animate-turn-ended"
        }`}
      >
        <p className="font-heading text-lg tracking-wide">{captainName}&rsquo;s turn ends</p>
      </div>
    </div>
  );
}
