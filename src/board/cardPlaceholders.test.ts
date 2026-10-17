import { describe, expect, it } from "vitest";
import { CARD_ART, CARD_ART_SLOTS } from "./cardArtSlots";
import { PLACEHOLDER_FRAME, placeholderArt } from "./cardPlaceholders";

describe("the event cards' placeholder art (#247)", () => {
  it("every slot, the back too, has its own engraving in the art's 3:4 frame", () => {
    expect(PLACEHOLDER_FRAME.width / PLACEHOLDER_FRAME.height).toBe(3 / 4);
    const drawn = CARD_ART_SLOTS.map((slot) => JSON.stringify(placeholderArt(slot)));
    for (const shapes of drawn) expect(shapes.length).toBeGreaterThan(2);
    expect(new Set(drawn).size).toBe(CARD_ART_SLOTS.length);
  });

  it("a card that flies a flag raises a staff at its flag's hoist, for the tinted flag to fly from", () => {
    for (const slot of CARD_ART_SLOTS) {
      const flag = CARD_ART[slot].flag;
      if (!flag) continue;
      const hoistX = Math.round(flag.box.x * PLACEHOLDER_FRAME.width * 10) / 10;
      const hoistY = Math.round(flag.box.y * PLACEHOLDER_FRAME.height * 10) / 10;
      expect(placeholderArt(slot)).toContainEqual(
        expect.objectContaining({ kind: "path", d: expect.stringMatching(new RegExp(`^M${hoistX} ${hoistY - 6} V`)) })
      );
    }
  });

  it("only draws the palette of the prompts doc: parchment, ink, brass, wax red and sea", () => {
    const colours = new Set(
      CARD_ART_SLOTS.flatMap((slot) => placeholderArt(slot)).flatMap((shape) => [shape.fill, shape.stroke]).filter(Boolean)
    );
    for (const colour of colours) expect(["#e5d4a9", "#f3e3b6", "#d2bb85", "#2b1d10", "#5c4630", "#b98b3e", "#8a2617", "#2f5d62"]).toContain(colour);
  });
});
