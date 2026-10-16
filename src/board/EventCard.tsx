import { useEffect } from "react";
import { useShellFonts } from "../online/useShellFonts";
import type { EventCardFace } from "./eventCardView";

/** How long the card stays up unless clicked away, in ms. */
const SHOWN_FOR = 6000;

/**
 * The event card drawn as a turn ended (#246), shown to every player: its
 * name and region in the online shell's IM Fell over the art, and its
 * effect in one line. A click, or a few seconds, dismisses it. The art
 * frame is a plain placeholder until the card art lands (#247); the
 * presentation queue, sting and camera flight are #248's.
 */
export function EventCard({ card, onDone }: { card: EventCardFace; onDone: () => void }) {
  useShellFonts();
  useEffect(() => {
    const timer = setTimeout(onDone, SHOWN_FOR);
    return () => clearTimeout(timer);
  }, [card.id, onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
      <button
        type="button"
        onClick={onDone}
        aria-label={`${card.title}${card.region ? `, ${card.region}` : ""}: ${card.effect} Click to dismiss.`}
        className="pointer-events-auto w-64 max-w-full text-left rounded-md border border-ink/40 bg-parchment bg-[radial-gradient(ellipse_at_40%_35%,var(--color-parchment)_45%,var(--color-parchment-dark))] text-ink p-3 shadow-[0_10px_30px_rgba(0,0,0,0.55)] cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        <span role="status" className="block">
          <span className="block font-fell-sc text-2xl leading-tight text-center">{card.title}</span>
          {card.region && <span className="block font-fell italic text-base text-ink-faded text-center">{card.region}</span>}
          {/* The card's art (#247) goes here; it carries no text of its own */}
          <span aria-hidden="true" className="block my-2 aspect-[4/3] rounded-sm border border-ink/25 bg-ink/10" />
          <span className="block font-fell text-[15px] leading-snug text-center">{card.effect}</span>
        </span>
      </button>
    </div>
  );
}
