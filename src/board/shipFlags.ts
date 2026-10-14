/**
 * The flag a ship flies (#134): the nation its captain sails under, or the
 * Jolly Roger once that player has turned pirate. Each flag is drawn in code
 * as a list of plain shapes, so no image file or licence is needed; the
 * shapes are painted onto a small canvas once (`shipFlagTextures.ts`) and
 * the texture is shared by every ship flying that flag. Pure, no Three.js.
 */
import { NATIONS, type Nation } from "../game/types";

export type ShipFlag = Nation | "JollyRoger";

export const SHIP_FLAGS: readonly ShipFlag[] = [...NATIONS, "JollyRoger"];

/**
 * The flag a ship flies: the Jolly Roger for a pirate, whatever nation it
 * once sailed under; else its captain's nation; `null` for a ship with no
 * captain yet. NPC merchants and flotillas are never pirates.
 */
export function shipFlagFor({ nation, pirate }: { nation: Nation | undefined; pirate: boolean }): ShipFlag | null {
  if (pirate) return "JollyRoger";
  return nation ?? null;
}

/** The flag's cloth, fly over hoist: the generator's flag is 2.60 m by 1.55 m, near enough 5:3. */
export const FLAG_ASPECT = 5 / 3;

/**
 * One shape of a flag's design. `x` runs from the hoist (0, at the staff) to
 * the fly (1), `y` from the head (0) to the foot (1). A circle's radius and a
 * line's width are fractions of the hoist, so they stay round on the cloth.
 */
export type FlagShape =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly colour: string }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number; readonly colour: string }
  | {
      readonly kind: "line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly colour: string;
    };

const WHITE = "#f4f1e8";
const RED = "#c8102e";
const BLUE = "#1f3f8f";
const ORANGE = "#f07f1a";
const DUTCH_BLUE = "#1c4e9c";
const BLACK = "#16130f";
const BONE = "#ece6d6";

const field = (colour: string): FlagShape => ({ kind: "rect", x: 0, y: 0, w: 1, h: 1, colour });

/** A centred cross, `arm` of the hoist wide. */
const cross = (arm: number, colour: string): FlagShape[] => [
  { kind: "rect", x: 0, y: 0.5 - arm / 2, w: 1, h: arm, colour },
  { kind: "rect", x: 0.5 - arm / (2 * FLAG_ASPECT), y: 0, w: arm / FLAG_ASPECT, h: 1, colour },
];

const DESIGNS: Readonly<Record<ShipFlag, readonly FlagShape[]>> = {
  // St George's cross: red on white.
  England: [field(WHITE), ...cross(0.22, RED)],
  // The French merchant ensign of the period: a white cross on royal blue.
  France: [field(BLUE), ...cross(0.2, WHITE)],
  // The Cross of Burgundy: a red saltire of knotted staves on white.
  Spain: [
    field(WHITE),
    { kind: "line", x1: 0.08, y1: 0.08, x2: 0.92, y2: 0.92, width: 0.16, colour: RED },
    { kind: "line", x1: 0.08, y1: 0.92, x2: 0.92, y2: 0.08, width: 0.16, colour: RED },
    // the knots where the branches were lopped
    { kind: "circle", cx: 0.29, cy: 0.29, r: 0.07, colour: RED },
    { kind: "circle", cx: 0.71, cy: 0.71, r: 0.07, colour: RED },
    { kind: "circle", cx: 0.29, cy: 0.71, r: 0.07, colour: RED },
    { kind: "circle", cx: 0.71, cy: 0.29, r: 0.07, colour: RED },
  ],
  // The Prinsenvlag: orange, white and blue.
  Netherlands: [
    field(WHITE),
    { kind: "rect", x: 0, y: 0, w: 1, h: 1 / 3, colour: ORANGE },
    { kind: "rect", x: 0, y: 2 / 3, w: 1, h: 1 / 3, colour: DUTCH_BLUE },
  ],
  // A skull over crossed bones, pale on black.
  JollyRoger: [
    field(BLACK),
    { kind: "line", x1: 0.3, y1: 0.85, x2: 0.7, y2: 0.55, width: 0.08, colour: BONE },
    { kind: "line", x1: 0.3, y1: 0.55, x2: 0.7, y2: 0.85, width: 0.08, colour: BONE },
    { kind: "circle", cx: 0.5, cy: 0.38, r: 0.2, colour: BONE },
    { kind: "rect", x: 0.45, y: 0.45, w: 0.1, h: 0.17, colour: BONE },
    { kind: "circle", cx: 0.455, cy: 0.38, r: 0.055, colour: BLACK },
    { kind: "circle", cx: 0.545, cy: 0.38, r: 0.055, colour: BLACK },
  ],
};

/** The shapes `flag` is painted from, field first. */
export const flagDesign = (flag: ShipFlag): readonly FlagShape[] => DESIGNS[flag];

/** The part of a 2D canvas context `paintFlag` draws with. */
export interface FlagCanvas {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

/** Paints `shapes` in order onto a `width` × `height` canvas, hoist on the left and head at the top. */
export function paintFlag(ctx: FlagCanvas, shapes: readonly FlagShape[], width: number, height: number): void {
  for (const shape of shapes) {
    switch (shape.kind) {
      case "rect":
        ctx.fillStyle = shape.colour;
        ctx.fillRect(shape.x * width, shape.y * height, shape.w * width, shape.h * height);
        break;
      case "circle":
        ctx.fillStyle = shape.colour;
        ctx.beginPath();
        ctx.arc(shape.cx * width, shape.cy * height, shape.r * height, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "line":
        ctx.strokeStyle = shape.colour;
        ctx.lineWidth = shape.width * height;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(shape.x1 * width, shape.y1 * height);
        ctx.lineTo(shape.x2 * width, shape.y2 * height);
        ctx.stroke();
        break;
    }
  }
}
