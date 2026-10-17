import type { PortNation } from "../game/types";
import { cardFlagLayer } from "./cardFlag";
import { CARD_ART, cardArtUrl, flagToTint, type CardArtSlot } from "./cardArtSlots";
import { EventCardArtPlaceholder } from "./EventCardArtPlaceholder";

/**
 * A card's art filling its frame (#247): the slot's image, or its
 * placeholder until the image lands; and, on a card that flies a flag, the
 * `nation`'s flag over it (cardFlag.ts, `flagToTint`).
 */
export function EventCardArt({ slot, nation }: { slot: CardArtSlot; nation: PortNation | null }) {
  const art = CARD_ART[slot];
  const { file } = art;
  const flag = flagToTint(art);
  const base = import.meta.env.BASE_URL;
  return (
    <span aria-hidden="true" className="absolute inset-0">
      {file ? (
        // The loading gate decoded this URL and keeps it (cardArtCache.ts), so it draws at once
        <img src={cardArtUrl(file, base)} alt="" draggable={false} decoding="sync" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <EventCardArtPlaceholder slot={slot} />
      )}
      {flag && nation && (
        <span
          className="absolute inset-0"
          style={cardFlagLayer({ nation, box: flag.box, maskUrl: flag.mask ? cardArtUrl(flag.mask, base) : null })}
        />
      )}
    </span>
  );
}
