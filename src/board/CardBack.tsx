import { EventCardArt } from "./EventCardArt";
import { CARD_FRAME, CARD_INNER_RULE } from "./eventCardStyles";

/**
 * The event deck's back (#247): one for every card, rounded in CSS like the
 * face. Shown only in the card lab (`?view=cards`) for now; the HUD has no
 * flip to show it in yet (#248's presentation).
 */
export function CardBack() {
  return (
    <span className={CARD_FRAME}>
      <EventCardArt slot="back" nation={null} />
      <span className={CARD_INNER_RULE} />
    </span>
  );
}
