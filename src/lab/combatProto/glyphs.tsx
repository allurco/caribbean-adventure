/**
 * PROTOTYPE: engraved line glyphs shared by the combat UI variants. Drawn in
 * currentColor so each variant inks them its own way.
 */
import type { Order, Place } from "./fakeCombat";

interface GlyphProps {
  className?: string;
}

/** A cannon on its carriage. */
function Cannon({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 30 L44 22 Q50 21 51 26 L52 30 Q52 35 46 35 L12 38 Q8 38 8 34 Z" />
      <path d="M51 24 L57 23 L57 33 L52 33" />
      <path d="M14 31 L44 25 M14 34 L46 30" strokeWidth={1} opacity={0.7} />
      <circle cx="22" cy="44" r="7" />
      <circle cx="22" cy="44" r="2" />
      <path d="M16 38 L40 37 L42 44 L30 47" />
      <path d="M58 26 q4 -2 3 -6 M59 29 q5 0 5 -3" strokeWidth={1.4} />
    </svg>
  );
}

/** A grappling iron: a shank with four barbed flukes, thrown on a coiled line. */
function Grapple({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="40" cy="10" r="3.5" />
      <path d="M40 14 L40 44" />
      <path d="M40 44 Q30 44 26 32 L23 36 M26 32 L30 33" />
      <path d="M40 44 Q50 44 54 32 L57 36 M54 32 L50 33" />
      <path d="M40 44 Q36 52 33 52 M40 44 Q44 52 47 52" strokeWidth={1.6} />
      <path d="M37 10 Q22 6 16 14 Q10 22 18 26 Q26 30 22 38 Q18 46 8 46" strokeWidth={1.4} />
      <path d="M11 50 q-5 4 0 8 q5 4 10 0" strokeWidth={1.2} opacity={0.7} />
    </svg>
  );
}

/** A full sail running before the wind. */
function Sail({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M30 4 L30 52" />
      <path d="M14 12 L46 12 Q54 26 46 40 L14 40 Q22 26 14 12 Z" />
      <path d="M20 18 Q26 26 20 34 M26 16 Q33 26 26 38 M38 16 Q44 26 38 38" strokeWidth={1} opacity={0.7} />
      <path d="M8 54 Q20 50 32 54 Q44 58 56 54" />
      <path d="M4 22 L10 22 M2 28 L9 28 M5 34 L11 34" strokeWidth={1.4} />
    </svg>
  );
}

export function OrderGlyph({ order, className }: GlyphProps & { order: Order }) {
  if (order === "broadside") return <Cannon className={className} />;
  if (order === "closeIn") return <Grapple className={className} />;
  return <Sail className={className} />;
}

/** Small glyphs for the five places of impact. */
export function PlaceGlyph({ place, className }: GlyphProps & { place: Place }) {
  const common = { viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (place) {
    case "Mast":
      return (
        <svg {...common}>
          <path d="M12 2 L12 22 M6 6 L18 6 M7 13 L17 13" />
          <path d="M14 9 L18 10 M5 17 L9 15" />
        </svg>
      );
    case "Crew":
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="3.5" />
          <path d="M5 21 Q5 13 12 13 Q19 13 19 21" />
        </svg>
      );
    case "Cannons":
      return (
        <svg {...common}>
          <path d="M3 13 L17 9 Q20 9 20 12 Q20 14 17 14 L4 16 Z" />
          <circle cx="8" cy="18" r="3" />
        </svg>
      );
    case "Hull":
      return (
        <svg {...common}>
          <path d="M2 10 L22 10 L19 18 Q12 20 5 18 Z" />
          <path d="M10 12 L12 15 L14 12" />
        </svg>
      );
    case "Cargo":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="12" rx="1" />
          <path d="M4 11 L20 11 M12 7 L12 19" />
        </svg>
      );
  }
}

/** A die face, 1 to 6, drawn as pips. */
export function DieFace({
  value,
  className,
  pipClassName = "fill-current",
}: GlyphProps & { value: number; pipClassName?: string }) {
  const pips: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [[7, 7], [17, 17]],
    3: [[7, 7], [12, 12], [17, 17]],
    4: [[7, 7], [17, 7], [7, 17], [17, 17]],
    5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
    6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]],
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={`a ${value}`} role="img">
      {(pips[value] ?? []).map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2.1} className={pipClassName} />
      ))}
    </svg>
  );
}
