import { describe, expect, it } from "vitest";
import { HULL_FOAM_FULL_SPEED, HULL_FOAM_LACE_METRES, HULL_FOAM_NOISE_SCALE } from "./hullFoam";
import { SHIP_CLASSES } from "../../game/types";
import { shipWaterline } from "../shipHull";
import {
  KELVIN_HALF_ANGLE,
  WAKE_ARM_BEAMS,
  WAKE_ARM_LIFETIME_SECONDS,
  WAKE_ARM_REACH_BEAMS,
  WAKE_ARM_STRENGTH,
  WAKE_CENTRE_BEAMS,
  WAKE_CENTRE_SPREAD,
  WAKE_CENTRE_STRENGTH,
  WAKE_FEATHER_SLANT,
  WAKE_FEATHER_SPACING_BEAMS,
  WAKE_FOAM_GLSL,
  WAKE_LACE_METRES,
  WAKE_LIFETIME_SECONDS,
  WAKE_NOISE_SCALE,
  wakeArmFeather,
  wakeFoamCoverage,
  wakeSegmentCoverage,
  wakeSegmentReach,
} from "./wakeFoam";

const beam = 0.22;
/** Every class's waterline and the box hull's, as the ships register them. */
const SHIP_WATERLINES = [...SHIP_CLASSES, undefined].map((shipClass) => {
  const waterline = shipWaterline(shipClass);
  return { halfLength: waterline.length / 2, beam: waterline.beam };
});
const sharp = 1e-6; // ship zoom: every line many pixels wide
const fast = HULL_FOAM_FULL_SPEED;
const KELVIN_TAN = Math.tan(KELVIN_HALF_ANGLE);
const spacing = WAKE_FEATHER_SPACING_BEAMS * beam;
/** A path astern of the bow where the arm's line crosses the middle of a feather, `k` feathers along. */
/** Far enough astern of the bow that the arms are gone: the centre alone. */
const pastArms = WAKE_ARM_REACH_BEAMS * beam + 0.1;
const crestPath = (k: number) => {
  const middle = 0.5 + 0.2 * (((k * 0.754878 + 0.31) % 1) - 0.5);
  return ((k + middle) * spacing) / (1 - WAKE_FEATHER_SLANT * KELVIN_TAN);
};
/** A path astern of the bow where the arm's line crosses the boundary between crest `k` and the next: a gap. */
const gapPath = (k: number) => ((k + 1) * spacing) / (1 - WAKE_FEATHER_SLANT * KELVIN_TAN);

describe("KELVIN_HALF_ANGLE", () => {
  it("is the Kelvin wedge's half angle, asin(1/3) ≈ 19.47°", () => {
    expect(KELVIN_HALF_ANGLE).toBeCloseTo(Math.asin(1 / 3), 12);
    expect((KELVIN_HALF_ANGLE * 180) / Math.PI).toBeCloseTo(19.47, 2);
  });
});

describe("wakeFoamCoverage: the centre", () => {
  it("is dense just astern and falls to nothing with age", () => {
    const justAstern = wakeFoamCoverage(0.5, 0, 0, fast, beam, sharp);
    expect(justAstern).toBeCloseTo(WAKE_CENTRE_STRENGTH, 9);
    const ages = [0, 0.25, 0.5, 1, 2, 3, 4];
    const along = ages.map((age) => wakeFoamCoverage(0.5, 0, age, fast, beam, sharp));
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
    expect(wakeFoamCoverage(0.5, 0, WAKE_LIFETIME_SECONDS, fast, beam, sharp)).toBe(0);
    expect(wakeFoamCoverage(0.5, 0, WAKE_LIFETIME_SECONDS + 1, fast, beam, sharp)).toBe(0);
  });

  it("settles quickly from fresh churn into lace that lingers: well under its fresh strength a second astern, still there at two", () => {
    expect(wakeFoamCoverage(0.5, 0, 1, fast, beam, sharp)).toBeLessThan(0.65 * WAKE_CENTRE_STRENGTH);
    expect(wakeFoamCoverage(0.5, 0, 2, fast, beam, sharp)).toBeGreaterThan(0.25);
  });

  it("is no wider than about the beam, and never a flat band: densest on the path", () => {
    expect(WAKE_CENTRE_BEAMS).toBeLessThanOrEqual(1);
    expect(WAKE_CENTRE_BEAMS * (1 + WAKE_CENTRE_SPREAD * WAKE_LIFETIME_SECONDS)).toBeLessThan(1.5);
    const half = 0.5 * beam * WAKE_CENTRE_BEAMS;
    expect(wakeFoamCoverage(pastArms, half + 1e-6, 0, fast, beam, sharp)).toBe(0);
    const at = (across: number) => wakeFoamCoverage(pastArms, across, 0, fast, beam, sharp);
    expect(at(0.4 * half)).toBeLessThan(at(0));
    expect(at(0.7 * half)).toBeLessThan(at(0.4 * half));
  });

  it("narrows with age: its dense core (over a third covered) is narrower an older second astern", () => {
    const coreWidth = (age: number) => {
      let width = 0;
      for (let i = 0; i <= 400; i++) {
        const across = (i / 400) * beam;
        if (wakeFoamCoverage(pastArms, across, age, fast, beam, sharp) > 0.33) width = across;
      }
      return width;
    };
    expect(coreWidth(1.5)).toBeLessThan(coreWidth(0));
  });

  it("lays nothing ahead of the bow", () => {
    expect(wakeFoamCoverage(-0.01, 0, 0, fast, beam, sharp)).toBe(0);
  });
});

describe("wakeArmFeather", () => {
  it("breaks the arm into many short crests: full at a crest, nothing between two", () => {
    const path = crestPath(3);
    const across = path * KELVIN_TAN;
    expect(wakeArmFeather(path, across, beam, sharp)).toBeCloseTo(1, 9);
    const gap = gapPath(3);
    expect(wakeArmFeather(gap, gap * KELVIN_TAN, beam, sharp)).toBe(0);
    // Several to a beam of path: small, close-packed crests.
    expect(WAKE_FEATHER_SPACING_BEAMS).toBeLessThanOrEqual(0.25);
  });

  it("varies the crests' lengths, so they are not stamped out alike", () => {
    const lengths = [2, 3, 4, 5, 6, 7].map((k) => {
      let covered = 0;
      for (let i = 0; i < 200; i++) {
        const p = gapPath(k - 1) + ((gapPath(k) - gapPath(k - 1)) * i) / 200;
        if (wakeArmFeather(p, p * KELVIN_TAN, beam, sharp) > 0.5) covered++;
      }
      return covered;
    });
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(20);
  });

  it("slants each feather: moving out across the arm, its crest falls aft", () => {
    const path = crestPath(3);
    const across = path * KELVIN_TAN;
    const out = 0.2 * beam;
    expect(wakeArmFeather(path + WAKE_FEATHER_SLANT * out, across + out, beam, sharp)).toBeCloseTo(1, 9);
    expect(WAKE_FEATHER_SLANT).toBeCloseTo(Math.tan((35.26 * Math.PI) / 180), 3);
  });

  it("falls back to its mean where the feathers are a few pixels apart (map zoom)", () => {
    const path = crestPath(3);
    const across = path * KELVIN_TAN;
    const far = spacing; // a crest to a pixel
    const gap = gapPath(3);
    expect(wakeArmFeather(path, across, beam, far)).toBeCloseTo(wakeArmFeather(gap, gap * KELVIN_TAN, beam, far), 9);
    expect(wakeArmFeather(path, across, beam, far)).toBeGreaterThan(0.3);
  });
});

describe("wakeFoamCoverage: the Kelvin arms", () => {
  const path = crestPath(20);
  const arm = path * KELVIN_TAN;
  const at = (across: number, age = 0.3, speed = fast, footprint = sharp, p = path) => wakeFoamCoverage(p, across, age, speed, beam, footprint);

  it("puts feathered arms at the Kelvin angle either side of the path, stronger at speed", () => {
    expect(at(arm)).toBeGreaterThan(0.6 * WAKE_ARM_STRENGTH);
    expect(at(-arm)).toBeCloseTo(at(arm), 12);
    // Off the arm, between it and the centre line, the water is clear.
    expect(at(arm * 0.5)).toBe(0);
    expect(at(arm * 1.6)).toBe(0);
    expect(at(arm, 0.3, fast / 4)).toBeLessThan(at(arm));
    expect(at(arm, 0.3, 0)).toBe(0);
    // Between two feathers along the line, a gap.
    const gap = gapPath(20);
    expect(at(gap * KELVIN_TAN, 0.3, fast, sharp, gap)).toBeLessThan(0.2 * at(arm));
  });

  it("fades the arms long before the centre: gone by WAKE_ARM_LIFETIME_SECONDS", () => {
    expect(WAKE_ARM_LIFETIME_SECONDS).toBeLessThan(0.5 * WAKE_LIFETIME_SECONDS);
    expect(at(arm, 0.9 * WAKE_ARM_LIFETIME_SECONDS)).toBeLessThan(at(arm, 0.2));
    expect(at(arm, WAKE_ARM_LIFETIME_SECONDS)).toBe(0);
  });

  it("reaches only a short way astern of the bow, so it never runs back to a move's start", () => {
    const reach = WAKE_ARM_REACH_BEAMS * beam;
    const beyond = crestPath(Math.ceil(reach / spacing) + 1);
    expect(at(beyond * KELVIN_TAN, 0.2, fast, sharp, beyond)).toBe(0);
    expect(WAKE_ARM_REACH_BEAMS * beam).toBeLessThan(4); // well under the 7 units the trail keeps
    // Strongest near the stern: an early feather beats a late one.
    const late = crestPath(Math.floor((0.85 * reach) / spacing));
    expect(at(late * KELVIN_TAN, 0.3, fast, sharp, late)).toBeLessThan(at(arm));
  });

  it("widens the arms with age", () => {
    const off = arm + beam * 0.06;
    expect(at(off, 1) / at(arm, 1)).toBeGreaterThan(at(off, 0.1) / at(arm, 0.1));
  });

  it("keeps the arms at least LINE_MIN_PIXELS wide at mid zoom, and drops them at map zoom", () => {
    // Mid zoom (camera about 13 out): an arm's own width is about a pixel.
    const armWidth = WAKE_ARM_BEAMS * beam;
    expect(at(arm, 0.3, fast, armWidth)).toBeGreaterThan(0.3);
    // Map zoom: a fraction of a pixel; gone, while the centre stays.
    expect(at(arm, 0.3, fast, armWidth * 8)).toBe(0);
    expect(wakeFoamCoverage(0.5, 0, 0.2, fast, beam, armWidth * 8)).toBeGreaterThan(0);
  });
});

describe("wakeSegmentCoverage", () => {
  // A ship sailed from (0, −2) to (0, 0) along +z at full speed: the segment
  // runs astern from its centre at a = (0, 0) to b = (0, −1), laid a second
  // apart, a half hull from the bow at a.
  const halfLength = 0.39;
  const a = [0, 0] as const;
  const ab = [0, -1] as const;
  const seg = (x: number, z: number, footprint = sharp) =>
    wakeSegmentCoverage([x - a[0], z - a[1]], ab, 0, 1 / fast, halfLength, beam, footprint);

  it("follows the path: the centre line along the segment, the arms opening astern", () => {
    expect(seg(0, -0.1)).toBeGreaterThan(0.5);
    const path = crestPath(20);
    const z = -(path - halfLength);
    expect(seg(path * KELVIN_TAN, z)).toBeGreaterThan(0.3);
    expect(seg(-path * KELVIN_TAN, z)).toBeGreaterThan(0.3);
  });

  it("puts no foam ahead of the bow, for every class's hull", () => {
    for (const { halfLength: hl, beam: b } of SHIP_WATERLINES) {
      for (const across of [0, b / 2, b, 2 * b]) {
        const ahead = wakeSegmentCoverage([across, hl + 0.001], ab, 0, 1 / fast, hl, b, sharp);
        expect(ahead).toBe(0);
      }
    }
  });

  it("is nothing for a segment of no length", () => {
    expect(wakeSegmentCoverage([0, 0], [0, 0], 0, 0, halfLength, beam, sharp)).toBe(0);
  });

  it("stays inside its reach, at ship and at mid zoom", () => {
    for (const footprint of [sharp, 0.02]) {
      const reach = wakeSegmentReach(1, halfLength, beam, footprint);
      for (let i = 0; i < 400; i++) {
        const angle = (i / 400) * 2 * Math.PI;
        const r = 0.5 + reach + 0.001;
        expect(seg(r * Math.cos(angle), -0.5 + r * Math.sin(angle), footprint)).toBe(0);
      }
    }
  });

  it("reaches no farther than the centre line for a segment past the arms' reach", () => {
    const far = WAKE_ARM_REACH_BEAMS * beam + 1;
    expect(wakeSegmentReach(0.3, far, beam, sharp)).toBeCloseTo(wakeSegmentReach(0.3, far + 1, beam, sharp), 12);
    expect(wakeSegmentReach(0.3, far, beam, sharp)).toBeLessThan(beam);
  });
});

describe("wake lace", () => {
  it("is coarser than the hull's, so the churn keeps its texture at mid zoom", () => {
    expect(WAKE_NOISE_SCALE).toBeLessThan(HULL_FOAM_NOISE_SCALE);
    expect(WAKE_LACE_METRES).toBeGreaterThan(HULL_FOAM_LACE_METRES);
    expect(WAKE_LACE_METRES / HULL_FOAM_LACE_METRES).toBeCloseTo(HULL_FOAM_NOISE_SCALE / WAKE_NOISE_SCALE, 9);
  });
});

describe("WAKE_FOAM_GLSL", () => {
  it("mirrors the constants and functions", () => {
    expect(WAKE_FOAM_GLSL).toContain(`const float KELVIN_TAN = ${KELVIN_TAN.toFixed(6)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_LIFETIME_SECONDS = ${WAKE_LIFETIME_SECONDS.toFixed(4)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_ARM_LIFETIME_SECONDS = ${WAKE_ARM_LIFETIME_SECONDS.toFixed(4)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_ARM_REACH_BEAMS = ${WAKE_ARM_REACH_BEAMS.toFixed(4)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_FEATHER_SLANT = ${WAKE_FEATHER_SLANT.toFixed(6)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_NOISE_SCALE = ${WAKE_NOISE_SCALE.toFixed(4)};`);
    expect(WAKE_FOAM_GLSL).toContain("float wakeArmFeather(float path, float across, float beam, float footprint)");
    expect(WAKE_FOAM_GLSL).toContain("float wakeFoamCoverage(float path, float across, float age, float speed, float beam, float footprint)");
    expect(WAKE_FOAM_GLSL).toContain(
      "float wakeSegmentCoverage(vec2 offset, vec2 ab, float ageA, float ageB, float pathA, float beam, float footprint)",
    );
    expect(WAKE_FOAM_GLSL).toContain("float wakeSegmentReach(float segmentLength, float pathA, float beam, float footprint)");
  });
});
