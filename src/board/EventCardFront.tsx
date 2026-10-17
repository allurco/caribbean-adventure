import { EventCardArt } from "./EventCardArt";
import { CARD_INNER_RULE } from "./eventCardStyles";
import type { EventCardFace } from "./eventCardView";

/**
 * What an event card's face shows inside its frame (`CARD_FRAME`, #247): the
 * art filling it, the name and region in IM Fell over the art's clear top,
 * and the effect in one line on a parchment band at its foot.
 */
export function EventCardFront({ card }: { card: EventCardFace }) {
  return (
    <>
      <EventCardArt slot={card.art} nation={card.nation} />
      <span className="absolute inset-x-0 top-0 block bg-gradient-to-b from-parchment/90 via-parchment/65 to-transparent px-3 pt-3 pb-7 text-center">
        <span className="block font-fell-sc text-2xl leading-tight">{card.title}</span>
        {card.region && <span className="block font-fell italic text-base text-ink-faded">{card.region}</span>}
      </span>
      <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-parchment via-parchment/90 to-transparent px-3 pt-6 pb-3 text-center font-fell text-[15px] leading-snug">
        {card.effect}
      </span>
      <span className={CARD_INNER_RULE} />
    </>
  );
}
