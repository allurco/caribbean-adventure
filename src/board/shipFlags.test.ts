import { describe, it, expect } from "vitest";
import { NATIONS } from "../game/types";
import { FLAG_ASPECT, SHIP_FLAGS, flagDesign, paintFlag, shipFlagFor, type FlagCanvas, type FlagShape } from "./shipFlags";

describe("shipFlagFor", () => {
  it("flies the captain's nation", () => {
    for (const nation of NATIONS) expect(shipFlagFor({ nation, pirate: false })).toBe(nation);
  });

  it("flies the Jolly Roger once the player has turned pirate, whatever the nation", () => {
    for (const nation of NATIONS) expect(shipFlagFor({ nation, pirate: true })).toBe("JollyRoger");
    expect(shipFlagFor({ nation: undefined, pirate: true })).toBe("JollyRoger");
  });

  it("flies nothing for a ship with no captain yet that is no pirate", () => {
    expect(shipFlagFor({ nation: undefined, pirate: false })).toBeNull();
  });
});

const covers = (shape: FlagShape, x: number, y: number): boolean => {
  switch (shape.kind) {
    case "rect":
      return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
    case "circle":
      return Math.hypot(x - shape.cx, y - shape.cy) <= shape.r;
    case "line": {
      const [dx, dy] = [shape.x2 - shape.x1, shape.y2 - shape.y1];
      const t = Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - (shape.x1 + t * dx), y - (shape.y1 + t * dy)) <= shape.width / 2;
    }
  }
};

/** The colour of the topmost shape at (x, y), in the flag's unit square (x hoist to fly, y head to foot). */
const colourAt = (shapes: readonly FlagShape[], x: number, y: number): string | undefined =>
  [...shapes].reverse().find((shape) => covers(shape, x, y))?.colour;

describe("flagDesign", () => {
  it("opens every flag with a field that covers it", () => {
    for (const flag of SHIP_FLAGS) {
      const [field] = flagDesign(flag);
      expect(field).toEqual(expect.objectContaining({ kind: "rect", x: 0, y: 0, w: 1, h: 1 }));
    }
  });

  it("gives every flag its own look", () => {
    const looks = SHIP_FLAGS.map((flag) => JSON.stringify(flagDesign(flag)));
    expect(new Set(looks).size).toBe(SHIP_FLAGS.length);
  });

  it("draws England's red St George's cross on white", () => {
    const shapes = flagDesign("England");
    expect(colourAt(shapes, 0.1, 0.1)).toBe(colourAt(shapes, 0.9, 0.9));
    const white = colourAt(shapes, 0.1, 0.1)!;
    const red = colourAt(shapes, 0.5, 0.5)!;
    expect(white).not.toBe(red);
    expect(colourAt(shapes, 0.05, 0.5)).toBe(red);
    expect(colourAt(shapes, 0.5, 0.05)).toBe(red);
  });

  it("draws the Netherlands as orange over white over blue", () => {
    const shapes = flagDesign("Netherlands");
    const [top, middle, bottom] = [colourAt(shapes, 0.5, 0.15), colourAt(shapes, 0.5, 0.5), colourAt(shapes, 0.5, 0.85)];
    expect(new Set([top, middle, bottom]).size).toBe(3);
    expect(colourAt(shapes, 0.1, 0.15)).toBe(top);
    expect(colourAt(shapes, 0.9, 0.85)).toBe(bottom);
  });

  it("draws Spain's Cross of Burgundy: a red saltire on white, corner to corner", () => {
    const shapes = flagDesign("Spain");
    const white = colourAt(shapes, 0.5, 0.05)!;
    const red = colourAt(shapes, 0.5, 0.5)!;
    expect(red).not.toBe(white);
    expect(colourAt(shapes, 0.1, 0.1)).toBe(red);
    expect(colourAt(shapes, 0.9, 0.9)).toBe(red);
    expect(colourAt(shapes, 0.1, 0.9)).toBe(red);
    expect(colourAt(shapes, 0.05, 0.5)).toBe(white);
  });

  it("draws France with a white cross on royal blue", () => {
    const shapes = flagDesign("France");
    const blue = colourAt(shapes, 0.1, 0.1)!;
    const white = colourAt(shapes, 0.5, 0.5)!;
    expect(white).not.toBe(blue);
    expect(colourAt(shapes, 0.05, 0.5)).toBe(white);
    expect(colourAt(shapes, 0.9, 0.9)).toBe(blue);
  });

  it("draws the Jolly Roger as a pale skull over crossed bones on black", () => {
    const shapes = flagDesign("JollyRoger");
    const black = colourAt(shapes, 0.05, 0.05)!;
    expect(colourAt(shapes, 0.95, 0.95)).toBe(black);
    // the cranium, and the bones' ends standing out below it
    expect(colourAt(shapes, 0.5, 0.25)).not.toBe(black);
    expect(colourAt(shapes, 0.3, 0.85)).not.toBe(black);
    expect(colourAt(shapes, 0.7, 0.85)).not.toBe(black);
  });

  it("is drawn on the flag's 5:3 cloth", () => {
    expect(FLAG_ASPECT).toBeCloseTo(5 / 3, 10);
  });
});

describe("paintFlag", () => {
  it("paints each shape in order, scaled onto the canvas", () => {
    const calls: string[] = [];
    const ctx: FlagCanvas = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "butt",
      fillRect: (x, y, w, h) => calls.push(`fillRect ${x} ${y} ${w} ${h} ${ctx.fillStyle}`),
      beginPath: () => calls.push("beginPath"),
      arc: (x, y, r) => calls.push(`arc ${x} ${y} ${r}`),
      fill: () => calls.push(`fill ${ctx.fillStyle}`),
      moveTo: (x, y) => calls.push(`moveTo ${x} ${y}`),
      lineTo: (x, y) => calls.push(`lineTo ${x} ${y}`),
      stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth} ${ctx.lineCap}`),
    };
    paintFlag(
      ctx,
      [
        { kind: "rect", x: 0, y: 0, w: 1, h: 1, colour: "#fff" },
        { kind: "circle", cx: 0.5, cy: 0.5, r: 0.25, colour: "#000" },
        { kind: "line", x1: 0, y1: 0, x2: 1, y2: 1, width: 0.1, colour: "#f00" },
      ],
      200,
      100,
    );
    expect(calls).toEqual([
      "fillRect 0 0 200 100 #fff",
      "beginPath",
      "arc 100 50 25",
      "fill #000",
      "beginPath",
      "moveTo 0 0",
      "lineTo 200 100",
      "stroke #f00 10 round",
    ]);
  });
});
