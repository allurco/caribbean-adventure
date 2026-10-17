/**
 * The flag on an event card (#247): Flotilla patrol and Lost flag carry a
 * plain red flag in their art, and the HUD lays the card's nation over it.
 * The nation's flag is the one its ships fly (`flagDesign` in shipFlags.ts),
 * drawn as an SVG and stretched over the flag's box in the card's frame,
 * then cut to the flag's shape: the art's own mask once it lands
 * (cardArtSlots.ts says how), else a pennant drawn in the box for the
 * placeholder. Plain CSS values out, so the component only spreads them.
 * Pure.
 */
import type { PortNation } from "../game/types";
import type { FlagBox } from "./cardArtSlots";
import { flagDesign, type FlagShape, type ShipFlag } from "./shipFlags";

/** The flag a card flies for `nation`: a port the Pirates take flies the Jolly Roger. */
export function cardFlagOf(nation: PortNation): ShipFlag {
  return nation === "Pirate" ? "JollyRoger" : nation;
}

/** The SVG's size: the ships' flag cloth, 5:3. */
const FLAG_W = 500;
const FLAG_H = 300;

/** A number for SVG and CSS: three decimals at most, no trailing zeros. */
const num = (value: number) => String(Math.round(value * 1000) / 1000);

function shapeSvg(shape: FlagShape): string {
  switch (shape.kind) {
    case "rect":
      return `<rect x="${num(shape.x * FLAG_W)}" y="${num(shape.y * FLAG_H)}" width="${num(shape.w * FLAG_W)}" height="${num(shape.h * FLAG_H)}" fill="${shape.colour}"/>`;
    case "circle":
      return `<circle cx="${num(shape.cx * FLAG_W)}" cy="${num(shape.cy * FLAG_H)}" r="${num(shape.r * FLAG_H)}" fill="${shape.colour}"/>`;
    case "line":
      return `<line x1="${num(shape.x1 * FLAG_W)}" y1="${num(shape.y1 * FLAG_H)}" x2="${num(shape.x2 * FLAG_W)}" y2="${num(shape.y2 * FLAG_H)}" stroke="${shape.colour}" stroke-width="${num(shape.width * FLAG_H)}" stroke-linecap="round"/>`;
  }
}

/** `flag` as a standalone SVG document, hoist on the left. */
export function flagSvg(flag: ShipFlag): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FLAG_W} ${FLAG_H}" preserveAspectRatio="none">${flagDesign(flag).map(shapeSvg).join("")}</svg>`;
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** The placeholder's frame in SVG units: 3:4, like the art. */
const FRAME_W = 300;
const FRAME_H = 400;

/** A full-frame mask with one pennant in `box`, its top and foot waving, for a card with no flag mask of its own. */
function pennantMask(box: FlagBox): string {
  const x = box.x * FRAME_W;
  const y = box.y * FRAME_H;
  const w = box.w * FRAME_W;
  const h = box.h * FRAME_H;
  const wave = h * 0.12;
  const path =
    `M${num(x)} ${num(y)}` +
    ` C${num(x + w / 3)} ${num(y - wave)} ${num(x + (2 * w) / 3)} ${num(y + wave)} ${num(x + w)} ${num(y)}` +
    ` L${num(x + w)} ${num(y + h)}` +
    ` C${num(x + (2 * w) / 3)} ${num(y + h + wave)} ${num(x + w / 3)} ${num(y + h - wave)} ${num(x)} ${num(y + h)} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME_W} ${FRAME_H}" preserveAspectRatio="none"><path d="${path}" fill="#fff"/></svg>`;
}

/** The CSS of the layer that tints a card's flag, laid over the whole frame. */
export interface CardFlagLayer {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: "no-repeat";
  maskImage: string;
  WebkitMaskImage: string;
  maskSize: "100% 100%";
  WebkitMaskSize: "100% 100%";
  maskRepeat: "no-repeat";
  WebkitMaskRepeat: "no-repeat";
}

/** A CSS background position, as a percentage, that puts an image of fraction `size` of the frame at `offset`. */
const placed = (offset: number, size: number) => `${num(size >= 1 ? 0 : (offset / (1 - size)) * 100)}%`;

/**
 * The layer that flies `nation`'s flag over the card's `box`: the flag
 * stretched over the box, cut to the art's mask at `maskUrl` (a full-frame
 * image, served URL) or, with none, to a pennant drawn in the box.
 */
export function cardFlagLayer({ nation, box, maskUrl }: { nation: PortNation; box: FlagBox; maskUrl: string | null }): CardFlagLayer {
  const mask = maskUrl ? `url("${maskUrl}")` : svgUrl(pennantMask(box));
  return {
    backgroundImage: svgUrl(flagSvg(cardFlagOf(nation))),
    backgroundSize: `${num(box.w * 100)}% ${num(box.h * 100)}%`,
    backgroundPosition: `${placed(box.x, box.w)} ${placed(box.y, box.h)}`,
    backgroundRepeat: "no-repeat",
    maskImage: mask,
    WebkitMaskImage: mask,
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };
}
