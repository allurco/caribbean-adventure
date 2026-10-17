/**
 * The event card's frame (#247), shared by its face (`EventCard`) and its
 * back (`CardBack`): 3:4 like the art (896 × 1200), its corners rounded
 * here and never in the image, 16rem wide at most and never taller than the
 * screen less a margin, so it fits a phone held sideways (844 × 390) as well
 * as a desktop.
 */
export const CARD_FRAME =
  "relative block aspect-[3/4] w-[min(16rem,calc((100dvh_-_2rem)*0.75))] max-w-full overflow-hidden rounded-xl border border-ink/50 bg-parchment shadow-[0_10px_30px_rgba(0,0,0,0.55)]";

/** The fine engraved rule inside the frame's edge. */
export const CARD_INNER_RULE = "pointer-events-none absolute inset-1.5 rounded-lg border border-ink/30";
