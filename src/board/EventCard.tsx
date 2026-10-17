import { useEffect } from "react";
import { useShellFonts } from "../online/useShellFonts";
import type { EventCardFace } from "./eventCardView";
import { EventCardFront } from "./EventCardFront";
import { CARD_FRAME } from "./eventCardStyles";

/** How long the card stays up unless clicked away, in ms. */
const SHOWN_FOR = 6000;

/**
 * The event card drawn as a turn ended (#246), shown to every player: a 3:4
 * card (#247) whose art fills the frame, its name and region in the online
 * shell's IM Fell over the art's clear top, and its effect in one line on a
 * parchment band at its foot. The art carries no text; a card that flies a
 * flag flies its nation's (`EventCardArt`). A click, or a few seconds,
 * dismisses it. The presentation queue, sting and camera flight are #248's.
 */
export function EventCard({ card, onDone }: { card: EventCardFace; onDone: () => void }) {
  useShellFonts();
  useEffect(() => {
    const timer = setTimeout(onDone, SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [card.id, onDone]);
  return (
    <div role="status" className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
      <button
        type="button"
        onClick={onDone}
        aria-label={`${card.title}${card.region ? `, ${card.region}` : ""}: ${card.effect} Click to dismiss.`}
        className={`${CARD_FRAME} pointer-events-auto text-left text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300`}
      >
        <EventCardFront card={card} />
      </button>
    </div>
  );
}
