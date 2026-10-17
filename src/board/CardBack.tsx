import { EventCardArt } from "./EventCardArt";
import { CARD_FRAME, CARD_INNER_RULE } from "./eventCardStyles";

/** The event deck's back (#247): one for every card, rounded in CSS like the face. */
export function CardBack() {
  return (
    <span className={CARD_FRAME}>
      <EventCardArt slot="back" nation={null} />
      <span className={CARD_INNER_RULE} />
    </span>
  );
}
