import { describe, expect, it } from "vitest";
import { HULL_FOAM_FULL_SPEED } from "./hullFoam";
import { SHIP_CLASSES } from "../../game/types";
import { shipWaterline } from "../shipHull";
import {
  KELVIN_HALF_ANGLE,
  WAKE_ARM_STRENGTH,
  WAKE_CENTRE_STRENGTH,
  WAKE_FOAM_GLSL,
  WAKE_LIFETIME_SECONDS,
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

describe("KELVIN_HALF_ANGLE", () => {
  it("is the Kelvin wedge's half angle, asin(1/3) ≈ 19.47°", () => {
    expect(KELVIN_HALF_ANGLE).toBeCloseTo(Math.asin(1 / 3), 12);
    expect((KELVIN_HALF_ANGLE * 180) / Math.PI).toBeCloseTo(19.47, 2);
  });
});

describe("wakeFoamCoverage", () => {
  it("is strongest on the centre line just astern and falls to nothing with age", () => {
    const justAstern = wakeFoamCoverage(0.5, 0, 0, fast, beam, sharp);
    expect(justAstern).toBeCloseTo(WAKE_CENTRE_STRENGTH, 9);
    const ages = [0, 0.5, 1, 2, 3, 4];
    const along = ages.map((age) => wakeFoamCoverage(0.5, 0, age, fast, beam, sharp));
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
    expect(wakeFoamCoverage(0.5, 0, WAKE_LIFETIME_SECONDS, fast, beam, sharp)).toBe(0);
    expect(wakeFoamCoverage(0.5, 0, WAKE_LIFETIME_SECONDS + 1, fast, beam, sharp)).toBe(0);
  });

  it("is about a beam wide on the centre line", () => {
    expect(wakeFoamCoverage(0.3, beam * 0.15, 0, fast, beam, sharp)).toBeCloseTo(WAKE_CENTRE_STRENGTH, 9);
    expect(wakeFoamCoverage(0.3, beam * 0.75, 0, fast, beam, sharp)).toBe(0);
  });

  it("puts the arms at the Kelvin angle either side of the path, stronger at speed", () => {
    const path = 1.5;
    const arm = path * Math.tan(KELVIN_HALF_ANGLE);
    const at = (across: number, speed = fast) => wakeFoamCoverage(path, across, 0.4, speed, beam, sharp);
    expect(at(arm)).toBeGreaterThan(0.5 * WAKE_ARM_STRENGTH);
    expect(at(-arm)).toBeCloseTo(at(arm), 12);
    // Off the arm, between it and the centre line, the water is clear.
    expect(at(arm * 0.6)).toBe(0);
    expect(at(arm * 1.4)).toBe(0);
    // The peak is on the arm: a little in or out is weaker.
    expect(at(arm)).toBeGreaterThan(at(arm * 0.95));
    expect(at(arm)).toBeGreaterThan(at(arm * 1.05));
    expect(at(arm, fast / 4)).toBeLessThan(at(arm));
    expect(at(arm, 0)).toBe(0);
  });

  it("widens the arms and fades them with age", () => {
    const path = 1.5;
    const arm = path * Math.tan(KELVIN_HALF_ANGLE);
    const offArm = arm + beam * 0.15;
    expect(wakeFoamCoverage(path, offArm, 3, fast, beam, sharp) / wakeFoamCoverage(path, arm, 3, fast, beam, sharp)).toBeGreaterThan(
      wakeFoamCoverage(path, offArm, 0.2, fast, beam, sharp) / wakeFoamCoverage(path, arm, 0.2, fast, beam, sharp),
    );
    expect(wakeFoamCoverage(path, arm, 3, fast, beam, sharp)).toBeLessThan(wakeFoamCoverage(path, arm, 0.2, fast, beam, sharp));
  });

  it("lays nothing ahead of the bow", () => {
    expect(wakeFoamCoverage(-0.01, 0, 0, fast, beam, sharp)).toBe(0);
  });

  it("drops the thin arms where they would be under a pixel or two (map zoom), keeping the centre line", () => {
    const path = 1.5;
    const arm = path * Math.tan(KELVIN_HALF_ANGLE);
    expect(wakeFoamCoverage(path, arm, 0.2, fast, beam, beam)).toBe(0);
    expect(wakeFoamCoverage(0.5, 0, 0.2, fast, beam, beam)).toBeGreaterThan(0);
  });
});

describe("wakeSegmentCoverage", () => {
  // A ship sailed from (0, −2) to (0, 0) along +z at full speed: the segment
  // runs astern from its centre at a = (0, 0) to b = (0, −1), laid a second
  // apart, a half hull from the bow at a.
  const halfLength = 0.39;
  const a = [0, 0] as const;
  const ab = [0, -1] as const;
  const seg = (x: number, z: number) => wakeSegmentCoverage([x - a[0], z - a[1]], ab, 0, 1 / fast, halfLength, beam, sharp);

  it("follows the path: the centre line along the segment, the arms opening astern", () => {
    expect(seg(0, -0.5)).toBeGreaterThan(0.5);
    const path = halfLength + 0.8;
    expect(seg(path * Math.tan(KELVIN_HALF_ANGLE), -0.8)).toBeGreaterThan(0.3);
    expect(seg(-path * Math.tan(KELVIN_HALF_ANGLE), -0.8)).toBeGreaterThan(0.3);
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

  it("stays inside its reach", () => {
    const reach = wakeSegmentReach(1, halfLength, beam);
    for (let i = 0; i < 400; i++) {
      const angle = (i / 400) * 2 * Math.PI;
      const r = 0.5 + reach + 0.001;
      expect(seg(r * Math.cos(angle), -0.5 + r * Math.sin(angle))).toBe(0);
    }
  });
});

describe("WAKE_FOAM_GLSL", () => {
  it("mirrors the constants and functions", () => {
    expect(WAKE_FOAM_GLSL).toContain(`const float KELVIN_TAN = ${Math.tan(KELVIN_HALF_ANGLE).toFixed(6)};`);
    expect(WAKE_FOAM_GLSL).toContain(`const float WAKE_LIFETIME_SECONDS = ${WAKE_LIFETIME_SECONDS.toFixed(4)};`);
    expect(WAKE_FOAM_GLSL).toContain("float wakeFoamCoverage(float path, float across, float age, float speed, float beam, float footprint)");
    expect(WAKE_FOAM_GLSL).toContain(
      "float wakeSegmentCoverage(vec2 offset, vec2 ab, float ageA, float ageB, float pathA, float beam, float footprint)",
    );
    expect(WAKE_FOAM_GLSL).toContain("float wakeSegmentReach(float segmentLength, float pathA, float beam)");
  });
});
