/**
 * The event cards' art (#247): one slot per card kind of the deck (#240),
 * plus the card back, each an image under public/cards/ or none. A slot with
 * no image draws its placeholder (`EventCardArtPlaceholder`), so a card's
 * art drops in by adding its file and naming it here, with no other change.
 * cardArtSlots.test.ts holds the table to public/cards/ both ways, and
 * sceneAssets.ts puts every file here on the board's loading gate. Pure.
 *
 * The art is 3:4 (`CARD_ART_WIDTH` × `CARD_ART_HEIGHT`) and carries no
 * text: the HUD draws the frame, the rounding and the title
 * (docs/art/event-card-prompts.md).
 *
 * **Flags.** Flotilla patrol and Lost flag carry a plain red flag, tinted
 * per nation (cardFlag.ts). When their art lands, add beside it a mask the
 * same size as the art (`<name>.flag.webp`: opaque over the flag's cloth,
 * transparent elsewhere), name it as the slot's `flag.mask`, and set
 * `flag.box` to the flag's bounding box in the frame. The HUD then lays the
 * nation's flag over the box, cut to the mask. Until then the placeholder's
 * own flag uses the same layer, cut to a drawn pennant at the same box.
 */

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

/** The art's size in pixels, as the prompts doc asks for it: 3:4. */
export const CARD_ART_WIDTH = 896;
export const CARD_ART_HEIGHT = 1200;

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
  /** The flag tinted per nation, on the two cards that fly one; null on the rest. */
  flag: { mask: string | null; box: FlagBox } | null;
}

/** The placeholder flags' boxes: high on the right, clear of the title at the top. */
const PATROL_FLAG: FlagBox = { x: 0.56, y: 0.3, w: 0.3, h: 0.15 };
const LOST_FLAG: FlagBox = { x: 0.5, y: 0.28, w: 0.32, h: 0.16 };

/**
 * Each slot's art. All placeholders for now: the WebP images, the card
 * back's crop and the flag masks come with the maintainer's art (#247).
 */
export const CARD_ART: Readonly<Record<CardArtSlot, CardArt>> = {
  calmSeas: { file: null, flag: null },
  merchantConvoy: { file: null, flag: null },
  storm: { file: null, flag: null },
  flotillaPatrol: { file: null, flag: { mask: null, box: PATROL_FLAG } },
  npcPirate: { file: null, flag: null },
  clemency: { file: null, flag: null },
  lostFlag: { file: null, flag: { mask: null, box: LOST_FLAG } },
  back: { file: null, flag: null },
};

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
