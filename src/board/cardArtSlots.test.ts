import { describe, expect, expectTypeOf, it } from "vitest";
import type { EventCardKind } from "../game/types";
import { EVENT_DECK_MIX } from "../game/eventDeck";
import {
  CARD_ART,
  CARD_ART_SLOTS,
  EVENT_ART_KINDS,
  cardArtUrl,
  eventCardArtFiles,
  eventCardArtUrls,
  type EventArtKind,
} from "./cardArtSlots";

/** Every file under public/cards/, as served paths. */
const CARD_FILES = Object.keys(import.meta.glob("../../public/cards/**/*")).map((path) => path.replace("../../public/", ""));

describe("the event cards' art slots (#247)", () => {
  it("one slot per card kind of the PRD's deck (#240), plus the card back", () => {
    expect([...EVENT_ART_KINDS].sort()).toEqual(
      ["calmSeas", "clemency", "flotillaPatrol", "lostFlag", "merchantConvoy", "npcPirate", "storm"].sort()
    );
    expect(CARD_ART_SLOTS).toEqual([...EVENT_ART_KINDS, "back"]);
    expect(Object.keys(CARD_ART).sort()).toEqual([...CARD_ART_SLOTS].sort());
  });

  it("every kind the deck draws has an art slot", () => {
    expectTypeOf<EventCardKind>().toMatchTypeOf<EventArtKind>();
    for (const kind of Object.keys(EVENT_DECK_MIX)) expect(EVENT_ART_KINDS).toContain(kind);
  });

  it("only Flotilla patrol and Lost flag fly a flag to be tinted per nation", () => {
    const flagged = CARD_ART_SLOTS.filter((slot) => CARD_ART[slot].flag);
    expect(flagged.sort()).toEqual(["flotillaPatrol", "lostFlag"]);
  });

  it("every registered file is a WebP under public/cards/ that exists", () => {
    for (const file of eventCardArtFiles()) {
      expect(file).toMatch(/^cards\/[a-z0-9-]+(\.flag)?\.webp$/);
      expect(CARD_FILES).toContain(file);
    }
  });

  it("every file under public/cards/ is registered in the table", () => {
    expect([...CARD_FILES].sort()).toEqual([...eventCardArtFiles()].sort());
  });

  it("a flag mask only comes with its card's art, and lays its flag in the frame", () => {
    for (const slot of CARD_ART_SLOTS) {
      const { file, flag } = CARD_ART[slot];
      if (flag?.mask) {
        expect(file).not.toBeNull();
        const { x, y, w, h } = flag.box;
        expect(Math.min(x, y, w, h)).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(1);
        expect(y + h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("serves a file under the app's base path", () => {
    expect(cardArtUrl("cards/storm.webp", "/")).toBe("/cards/storm.webp");
    expect(cardArtUrl("cards/storm.webp", "/game/")).toBe("/game/cards/storm.webp");
    expect(eventCardArtUrls("/")).toEqual(eventCardArtFiles().map((file) => `/${file}`));
  });
});
