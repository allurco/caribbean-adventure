/**
 * The event cards' art under public/cards/ (#247), read off disk in Node
 * and held to what the HUD needs (cardArtCheck.ts): real WebP, 3:4, no
 * larger than the frame needs at 3× density, each flag mask its art's size.
 * Type-checked by tsconfig.node.json, as it uses Node's fs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CARD_ART, CARD_ART_SLOTS } from "./cardArtSlots";
import { cardArtProblems } from "./cardArtCheck";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);
const read = (file: string) => new Uint8Array(readFileSync(new URL(file, PUBLIC_DIR)));

describe("event card art files", () => {
  it("holds every card's art and flag mask to the HUD", () => {
    const problems = CARD_ART_SLOTS.flatMap((slot) => {
      const { file, flag } = CARD_ART[slot];
      if (!file) return [];
      return cardArtProblems(slot, read(file), flag?.mask ? read(flag.mask) : null);
    });
    expect(problems).toEqual([]);
  });
});
