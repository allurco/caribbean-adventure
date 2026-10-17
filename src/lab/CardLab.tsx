import { CardBack } from "../board/CardBack";
import type { CardArtSlot } from "../board/cardArtSlots";
import { EventCard } from "../board/EventCard";
import { EventCardFront } from "../board/EventCardFront";
import { CARD_FRAME } from "../board/eventCardStyles";
import type { PortNation } from "../game/types";
import { useShellFonts } from "../online/useShellFonts";
import { labFace, labFaces } from "./cardLabFaces";

const noop = () => {};

/**
 * The event card lab (#247), dev only, at `?view=cards`: every card face
 * with its art (a placeholder for a slot with none), the flagged ones in
 * each nation's colours, and the back. With `&card=<kind|back>` (and
 * `&nation=`) one card is staged alone where the HUD shows it, the HUD's own
 * component, to check its size on a desktop and on a phone held sideways.
 */
export default function CardLab({ card, nation }: { card?: CardArtSlot; nation?: PortNation }) {
  useShellFonts();
  if (card) {
    return (
      <div className="fixed inset-0 bg-shell-harbour">
        {card === "back" ? (
          <div className="fixed inset-0 flex items-center justify-center px-4">
            <CardBack />
          </div>
        ) : (
          <EventCard card={labFace(card, nation ?? null)} onDone={noop} />
        )}
      </div>
    );
  }
  return (
    <div className="h-dvh overflow-y-auto bg-shell-harbour p-4 text-shell-timber-text">
      <h1 className="font-fell-sc text-3xl">Event cards</h1>
      <p className="font-fell mb-4">Every card with its art (#247). Add `&card=` and `&nation=` to stage one where the HUD shows it.</p>
      <div className="flex flex-wrap gap-4">
        {labFaces().map((face) => (
          <span key={face.id} className={`${CARD_FRAME} text-ink`}>
            <EventCardFront card={face} />
          </span>
        ))}
        <CardBack />
      </div>
    </div>
  );
}
