import { describe, expect, it } from "vitest";
import { cardFlagLayer, cardFlagOf, flagSvg } from "./cardFlag";
import { flagDesign, type FlagShape } from "./shipFlags";

/** The colours of `shapes`, in order: the ships' flag designs are the one source. */
const colours = (shapes: readonly FlagShape[]) => shapes.map((shape) => shape.colour);

const box = { x: 0.56, y: 0.3, w: 0.3, h: 0.15 };

/** The SVG inside a CSS `url("data:image/svg+xml,…")`. */
const svgOf = (cssUrl: string) => decodeURIComponent(cssUrl.replace(/^url\("data:image\/svg\+xml,/, "").replace(/"\)$/, ""));

describe("the flag a card flies (#247)", () => {
  it("a nation flies its own flag; a port taken by the Pirates, the Jolly Roger", () => {
    expect(cardFlagOf("Spain")).toBe("Spain");
    expect(cardFlagOf("Netherlands")).toBe("Netherlands");
    expect(cardFlagOf("Pirate")).toBe("JollyRoger");
  });

  it("draws the ships' flag designs, shape by shape in their colours: St George's cross is a field and two arms", () => {
    const svg = flagSvg("England");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 500 300"/);
    const [field, arm] = colours(flagDesign("England"));
    expect(svg).toContain(`<rect x="0" y="0" width="500" height="300" fill="${field}"/>`);
    expect(svg.match(new RegExp(`fill="${arm}"`, "g"))).toHaveLength(2);
  });

  it("every flag paints each of its shapes' colours, in order", () => {
    for (const flag of ["England", "France", "Spain", "Netherlands", "JollyRoger"] as const) {
      const painted = [...flagSvg(flag).matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map(([, colour]) => colour);
      expect(painted).toEqual(colours(flagDesign(flag)));
    }
  });

  it("draws Spain's saltire as stroked staves, and the Jolly Roger's skull as circles, sized on the 500 × 300 cloth", () => {
    expect(flagSvg("Spain")).toMatch(/<line [^>]*stroke-width="48" stroke-linecap="round"\/>/);
    expect(flagSvg("JollyRoger")).toMatch(/<circle cx="250" cy="114" r="60" fill="#[0-9a-f]{6}"\/>/);
  });
});

describe("the flag layer over a card's art (#247)", () => {
  it("stretches the nation's flag over the flag's box in the frame", () => {
    const layer = cardFlagLayer({ nation: "France", box, maskUrl: null });
    expect(svgOf(layer.backgroundImage)).toBe(flagSvg("France"));
    expect(layer.backgroundSize).toBe("30% 15%");
    // CSS percentages place the image's p% on the frame's p%: x / (1 - w)
    expect(layer.backgroundPosition).toBe("80% 35.294%");
    expect(layer.backgroundRepeat).toBe("no-repeat");
  });

  it("cuts it to the art's flag mask, the art's own size, once there is one", () => {
    const layer = cardFlagLayer({ nation: "England", box, maskUrl: "/cards/flotilla-patrol.flag.webp" });
    expect(layer.maskImage).toBe('url("/cards/flotilla-patrol.flag.webp")');
    expect(layer.WebkitMaskImage).toBe(layer.maskImage);
    expect(layer.maskSize).toBe("100% 100%");
  });

  it("without a mask, cuts it to a pennant drawn in the box, so the placeholder shows the tint", () => {
    const layer = cardFlagLayer({ nation: "England", box, maskUrl: null });
    const mask = svgOf(layer.maskImage);
    expect(mask).toMatch(/viewBox="0 0 300 400"/);
    // the pennant's hoist starts at the box's top left: 0.56 × 300, 0.3 × 400
    expect(mask).toContain("M168 120");
  });
});
