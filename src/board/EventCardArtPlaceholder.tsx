import { useId } from "react";
import { PAPER_DARK, PAPER_LIGHT, PLACEHOLDER_FRAME, placeholderArt } from "./cardPlaceholders";
import type { CardArtSlot } from "./cardArtSlots";

/**
 * A card's placeholder engraving (#247, cardPlaceholders.ts) on foxed
 * parchment, filling its frame, until the slot's painted art lands.
 */
export function EventCardArtPlaceholder({ slot }: { slot: CardArtSlot }) {
  const foxing = useId();
  const { width, height } = PLACEHOLDER_FRAME;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id={foxing} cx="50%" cy="42%" r="70%">
          <stop offset="55%" stopColor={PAPER_LIGHT} />
          <stop offset="100%" stopColor={PAPER_DARK} />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${foxing})`} />
      {placeholderArt(slot).map((shape, i) =>
        shape.kind === "path" ? (
          <path key={i} d={shape.d} fill={shape.fill ?? "none"} stroke={shape.stroke} strokeWidth={shape.width} opacity={shape.opacity} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ?? "none"} stroke={shape.stroke} strokeWidth={shape.width} opacity={shape.opacity} />
        )
      )}
    </svg>
  );
}
