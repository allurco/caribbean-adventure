/**
 * A word over the fight (#263): how a flight ended, escaped or caught, on a
 * parchment slip while the fight's director holds it up.
 */
export function CombatBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="fixed inset-x-0 top-1/4 z-40 flex justify-center pointer-events-none" role="status" aria-live="polite">
      <div className="px-6 py-3 rounded-md border border-ink/25 bg-parchment/95 text-ink text-center shadow-[0_6px_16px_rgba(0,0,0,0.45)]">
        <p className="font-heading text-xl tracking-wide">{text}</p>
      </div>
    </div>
  );
}
