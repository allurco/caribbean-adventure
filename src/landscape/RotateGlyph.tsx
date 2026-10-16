/**
 * A phone turning onto its side, in ink on parchment (#123). The phone swings
 * from upright to sideways and back; a dashed outline marks where it comes to
 * rest. With reduced motion it stays upright and the brass arrow alone says
 * which way to turn.
 */
export function RotateGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {/* Where it comes to rest: the phone on its side */}
      <rect x="31" y="46" width="58" height="32" rx="6" className="stroke-shell-rule" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="3 4" />
      {/* The turn: a brass arc and its arrowhead, upper right */}
      <path d="M78 22a34 34 0 0 1 20 26" className="stroke-shell-brass" strokeWidth="3" />
      <path d="m92 45 6 4 3-7" className="stroke-shell-brass" strokeWidth="3" />
      {/* The phone, pivoting on its centre */}
      <g data-testid="rotate-glyph-phone" className="motion-safe:animate-turn-ship [transform-box:fill-box] [transform-origin:center]">
        <rect x="44" y="33" width="32" height="58" rx="6" className="fill-shell-sail-soft stroke-shell-ink" strokeWidth="2.6" />
        <rect x="48.5" y="40" width="23" height="40" rx="1.5" className="fill-shell-sea" fillOpacity="0.28" />
        <path d="M56 37h8" className="stroke-shell-ink" strokeWidth="2" />
        <circle cx="60" cy="85.5" r="1.8" className="fill-shell-ink" />
      </g>
    </svg>
  );
}
