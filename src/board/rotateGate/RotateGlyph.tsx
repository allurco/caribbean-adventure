/**
 * A phone turning onto its side, drawn in ink on parchment. The solid phone
 * swings from upright to sideways and back; a dashed outline marks where it
 * comes to rest. With reduced motion it stays upright and the brass arrow
 * alone says which way to turn.
 */
export function RotateGlyph({ className = "w-28 h-28" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {/* where it comes to rest: the phone on its side */}
      <rect x="31" y="46" width="58" height="32" rx="6" stroke="#7a5c3a" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="3 4" />
      {/* the turn: a brass arc with its arrowhead, upper right */}
      <path d="M78 22a34 34 0 0 1 20 26" stroke="#a87a32" strokeWidth="3" />
      <path d="m92 45 6 4 3-7" stroke="#a87a32" strokeWidth="3" />
      {/* the phone itself, pivoting on its centre */}
      <g className="motion-safe:animate-turn-ship [transform-box:fill-box] [transform-origin:center]">
        <rect x="44" y="33" width="32" height="58" rx="6" fill="#efe3c2" stroke="#2b1d10" strokeWidth="2.6" />
        <rect x="48.5" y="40" width="23" height="40" rx="1.5" fill="#1d5f86" fillOpacity="0.28" />
        <path d="M56 37h8" stroke="#2b1d10" strokeWidth="2" />
        <circle cx="60" cy="85.5" r="1.8" fill="#2b1d10" />
      </g>
    </svg>
  );
}
