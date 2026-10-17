/**
 * The event cards' art (#247): one slot per card kind of the deck (#240),
 * plus the card back, each an image under public/cards/ or none. A slot with
 * no image draws its placeholder (`EventCardArtPlaceholder`), so a card's
 * art drops in by adding its file and naming it here, with no other change.
 * cardArtSlots.test.ts holds the table to public/cards/ both ways, and
 * sceneAssets.ts puts every file here on the board's loading gate. Pure.
 *
 * The art is 3:4, at most `CARD_ART_MAX` (cardArtCheck.ts), and carries no
 * text: the HUD draws the frame, the rounding and the title
 * (docs/art/event-card-prompts.md).
 *
 * **Flags.** Flotilla patrol and Lost flag carry a plain red flag, tinted
 * per nation (cardFlag.ts). Beside each one's art lies a mask the same size
 * (`<name>.flag.webp`: opaque over the flag's cloth, transparent elsewhere),
 * named as the slot's `flag.mask`, and `flag.box` is the flag's bounding box
 * in the frame. The HUD lays the nation's flag over the box, cut to the
 * mask. A new painting of either card needs its own mask and box; a slot
 * with no art cuts the placeholder's flag to a drawn pennant at the box.
 */
import { NATIONS, PORT_NATIONS, type PortNation } from "../game/types";

/**
 * Every kind of card the full deck holds (#240), drawn or still to come. The
 * game's `EventCardKind` (game/types.ts) grows into this list as each card's slice lands.
 */
export const EVENT_ART_KINDS = [
  "calmSeas",
  "merchantConvoy",
  "storm",
  "flotillaPatrol",
  "npcPirate",
  "clemency",
  "lostFlag",
] as const;

export type EventArtKind = (typeof EVENT_ART_KINDS)[number];

/** A card face's slot, or the one back the whole deck shares. */
export type CardArtSlot = EventArtKind | "back";

export const CARD_ART_SLOTS: readonly CardArtSlot[] = [...EVENT_ART_KINDS, "back"];

/** Where a flag lies in the card's frame, as fractions of its width (`x`, `w`) and height (`y`, `h`), from the top left. */
export interface FlagBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardArt {
  /** The image under public/, or null while it is not made: the slot then draws its placeholder. */
  file: string | null;
  /**
   * The flag tinted per nation, on the two cards that fly one; null on the
   * rest. On Lost flag it is the new flag being hoisted, the taker's.
   */
  flag: { mask: string | null; box: FlagBox } | null;
}

/** The flags' boxes: the bounding box of each painting's red flag, which its mask cuts to the cloth. */
const PATROL_FLAG: FlagBox = { x: 0.767, y: 0.411, w: 0.181, h: 0.133 };
const LOST_FLAG: FlagBox = { x: 0.517, y: 0.277, w: 0.273, h: 0.204 };

/**
 * Each slot's art (#247): WebP under public/cards/, cropped to 3:4 from the
 * maintainer's AI-generated paintings (NOTICE). Every slot now has its art,
 * so no card draws its placeholder.
 */
export const CARD_ART: Readonly<Record<CardArtSlot, CardArt>> = {
  calmSeas: { file: "cards/calm-seas.webp", flag: null },
  merchantConvoy: { file: "cards/merchant-convoy.webp", flag: null },
  storm: { file: "cards/storm.webp", flag: null },
  flotillaPatrol: { file: "cards/flotilla-patrol.webp", flag: { mask: "cards/flotilla-patrol.flag.webp", box: PATROL_FLAG } },
  npcPirate: { file: "cards/npc-pirate.webp", flag: null },
  clemency: { file: "cards/clemency.webp", flag: null },
  lostFlag: { file: "cards/lost-flag.webp", flag: { mask: "cards/lost-flag.flag.webp", box: LOST_FLAG } },
  back: { file: "cards/back.webp", flag: null },
};

/**
 * The flag to tint over `art`: the art's own, cut to its mask, or the
 * placeholder's pennant while there is no art. Null for a card with no flag,
 * and for painted art still missing its mask, which would otherwise get a
 * pennant drawn over the painting beside its own red flag.
 */
export function flagToTint({ file, flag }: CardArt): { mask: string | null; box: FlagBox } | null {
  if (!flag || (file && !flag.mask)) return null;
  return flag;
}

/** The nations whose flag `slot` may fly: a patrol a crown's; a lost flag a crown's or the Pirates'. */
export function flagNations(slot: CardArtSlot): readonly PortNation[] {
  if (slot === "flotillaPatrol") return NATIONS;
  if (slot === "lostFlag") return PORT_NATIONS;
  return [];
}

/** Every file the table names (art and flag masks), as paths under public/. */
export function eventCardArtFiles(): string[] {
  return CARD_ART_SLOTS.flatMap((slot) => {
    const { file, flag } = CARD_ART[slot];
    return [file, flag?.mask ?? null].filter((path): path is string => path !== null);
  });
}

/** A file under public/, served under the app's base path (`import.meta.env.BASE_URL`). */
export function cardArtUrl(file: string, base: string): string {
  return `${base}${file}`;
}

/** The URL of every card art file, under the app's base path. */
export function eventCardArtUrls(base: string): string[] {
  return eventCardArtFiles().map((file) => cardArtUrl(file, base));
}
