import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  FLAG_LIMP_DROOP,
  FLAG_RIPPLE_GROWTH,
  FLAG_RIPPLE_SHARE,
  SAIL_CLOSE_HAULED_DEG,
  SAIL_IN_IRONS_DEG,
  SAIL_LEEWARD_LEAN,
  SAIL_SLACK_BELLY,
  WIND_FULL_SPEED,
  flagClothPosition,
  flagNormal,
  flagRipple,
  flagStreamDirection,
  injectShipWind,
  loopRate,
  offTheWindDeg,
  sailBellyOffset,
  sailFullness,
  sailLuff,
  shipWindPose,
  writeShipWindPose,
  createShipWindUniforms,
  type ShipWindPoseInput,
} from "./shipWind";
import { SHIP_MODEL_ROTATION_Y, shipModelScale } from "./shipModels";
import { WAVE_LOOP_SECONDS } from "./visuals/waveClock";
import { TRADE_WIND, windFor } from "./visuals/wind";
import { SCENE_WIND } from "./visuals/sceneWind";
import { SHIP_SCALE, metresToUnits } from "./visuals/worldScale";

const DEG = Math.PI / 180;
const HEADINGS = Array.from({ length: 72 }, (_, k) => -Math.PI + (k * 5 + 0.5) * DEG);

/** A model-frame XZ vector in world space, through the ship's group (heading) and the model's own turn, as three.js does it. */
const toWorld = (heading: number, [x, z]: readonly [number, number]): [number, number] => {
  const v = new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), heading + SHIP_MODEL_ROTATION_Y);
  return [v.x, v.z];
};
/** A ship heading with the wind `offDeg` degrees off its bow's side of the wind's eye (0: head to wind, 180: dead astern), on the given tack. */
const headingOffTheWind = (offDeg: number, tack: 1 | -1 = 1) => {
  // The bow points at the wind's eye (−toward) turned by offDeg.
  const eye = Math.atan2(-SCENE_WIND.toward[0], -SCENE_WIND.toward[1]);
  return eye + tack * offDeg * DEG;
};
const pose = (over: Partial<ShipWindPoseInput> = {}) =>
  shipWindPose({ heading: 0.7, wind: SCENE_WIND, seconds: 12.5, reducedMotion: false, sinking: false, ...over });

describe("flagStreamDirection", () => {
  it("points downwind in the world, whatever the ship's heading", () => {
    for (const heading of HEADINGS) {
      const [x, z] = toWorld(heading, flagStreamDirection(heading, SCENE_WIND));
      expect(x).toBeCloseTo(SCENE_WIND.toward[0], 12);
      expect(z).toBeCloseTo(SCENE_WIND.toward[1], 12);
    }
  });

  it("is a unit vector in the model's frame", () => {
    for (const heading of HEADINGS) expect(Math.hypot(...flagStreamDirection(heading, SCENE_WIND))).toBeCloseTo(1, 12);
  });

  it("is dead ahead (model −Z, the bow) with the wind from astern", () => {
    const [x, z] = flagStreamDirection(headingOffTheWind(180), SCENE_WIND);
    expect(x).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(-1, 12);
  });
});

describe("offTheWindDeg", () => {
  it("is 0 head to wind, 90 on the beam and 180 dead astern, on either tack", () => {
    for (const off of [0, 30, 90, 135, 180]) {
      expect(offTheWindDeg(headingOffTheWind(off, 1), SCENE_WIND)).toBeCloseTo(off, 9);
      expect(offTheWindDeg(headingOffTheWind(off, -1), SCENE_WIND)).toBeCloseTo(off, 9);
    }
  });
});

describe("sailFullness", () => {
  it("is full with the wind from astern, on the quarter, on the beam and close-hauled", () => {
    for (const off of [180, 135, 90, SAIL_CLOSE_HAULED_DEG]) {
      expect(sailFullness(headingOffTheWind(off, 1), SCENE_WIND)).toBeCloseTo(1, 12);
      expect(sailFullness(headingOffTheWind(off, -1), SCENE_WIND)).toBeCloseTo(1, 12);
    }
  });

  it("is least head to wind: slack in irons", () => {
    for (const off of [0, SAIL_IN_IRONS_DEG / 2, SAIL_IN_IRONS_DEG]) expect(sailFullness(headingOffTheWind(off), SCENE_WIND)).toBe(0);
    const least = Math.min(...HEADINGS.map((h) => sailFullness(h, SCENE_WIND)));
    expect(sailFullness(headingOffTheWind(0), SCENE_WIND)).toBe(least);
  });

  it("is greatest with the wind from astern or the beam", () => {
    const most = Math.max(...HEADINGS.map((h) => sailFullness(h, SCENE_WIND)));
    expect(sailFullness(headingOffTheWind(180), SCENE_WIND)).toBe(most);
    expect(sailFullness(headingOffTheWind(90), SCENE_WIND)).toBe(most);
  });

  it("is continuous in heading, all the way round", () => {
    const steps = 3600;
    const step = (2 * Math.PI) / steps;
    // The steepest the ramp gets: smoothstep's 1.5 over the ramp's width.
    const steepest = (1.5 / ((SAIL_CLOSE_HAULED_DEG - SAIL_IN_IRONS_DEG) * DEG)) * step;
    for (let k = 0; k < steps; k++) {
      const a = sailFullness(k * step, SCENE_WIND);
      const b = sailFullness((k + 1) * step, SCENE_WIND);
      expect(Math.abs(b - a)).toBeLessThanOrEqual(steepest + 1e-12);
    }
  });

  it("only rises as the ship bears away from the wind", () => {
    let last = -1;
    for (let off = 0; off <= 180; off += 1) {
      const f = sailFullness(headingOffTheWind(off), SCENE_WIND);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
  });

  it("fills less in a lighter wind, and fully from WIND_FULL_SPEED up", () => {
    const astern = headingOffTheWind(180);
    expect(sailFullness(astern, { ...SCENE_WIND, speed: WIND_FULL_SPEED / 2 })).toBeCloseTo(0.5, 12);
    expect(sailFullness(astern, { ...SCENE_WIND, speed: 0 })).toBe(0);
    expect(sailFullness(astern, { ...SCENE_WIND, speed: WIND_FULL_SPEED * 3 })).toBe(1);
  });

  it("follows the wind round: the same heading relative to any wind gives the same fullness", () => {
    for (const swing of [-120, 10, 75]) {
      const wind = windFor({ ...TRADE_WIND, swingFromViewDeg: swing });
      const eye = Math.atan2(-wind.toward[0], -wind.toward[1]);
      expect(sailFullness(eye + 50 * DEG, wind)).toBeCloseTo(sailFullness(headingOffTheWind(50), SCENE_WIND), 12);
    }
  });
});

describe("sailBellyOffset", () => {
  // A square sail bellies forward (model −Z), a fore-and-aft sail to one side (±X).
  const square = [0, 0, -1.2] as const;
  const foreAndAft = [0.9, 0, 0] as const;
  const astern: [number, number] = [0, -1]; // downwind, model frame: toward the bow
  const fromPort: [number, number] = [1, 0]; // blowing toward +X
  const fromStarboard: [number, number] = [-1, 0];

  it("keeps the modelled belly when full with the wind from astern", () => {
    expect(sailBellyOffset(square, astern, 1)).toEqual([0, 0, -1.2]);
  });

  it("keeps SAIL_SLACK_BELLY of it when slack", () => {
    const [x, y, z] = sailBellyOffset(square, astern, 0);
    expect([x, y]).toEqual([0, 0]);
    expect(z).toBeCloseTo(-1.2 * SAIL_SLACK_BELLY, 12);
  });

  it("leaves a vertex on the sail's edge (no belly) where it is", () => {
    for (const fullness of [0, 0.5, 1]) expect(sailBellyOffset([0, 0, 0], fromPort, fullness)).toEqual([0, 0, 0]);
  });

  it("leans a square sail to leeward with the wind on the beam", () => {
    expect(sailBellyOffset(square, fromPort, 1)[0]).toBeCloseTo(1.2 * SAIL_LEEWARD_LEAN, 12);
    expect(sailBellyOffset(square, fromStarboard, 1)[0]).toBeCloseTo(-1.2 * SAIL_LEEWARD_LEAN, 12);
  });

  it("swings a fore-and-aft sail's belly to whichever side is leeward", () => {
    expect(sailBellyOffset(foreAndAft, fromPort, 1)[0]).toBeCloseTo(0.9, 12);
    expect(sailBellyOffset(foreAndAft, fromStarboard, 1)[0]).toBeCloseTo(-0.9, 12);
  });

  it("passes a fore-and-aft sail from side to side continuously as the wind crosses the centreline", () => {
    let last = sailBellyOffset(foreAndAft, [Math.sin(-Math.PI / 2), -Math.cos(-Math.PI / 2)], 1)[0];
    for (let k = 1; k <= 1800; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 1800;
      const x = sailBellyOffset(foreAndAft, [Math.sin(a), -Math.cos(a)], 1)[0];
      expect(Math.abs(x - last)).toBeLessThan(0.01);
      last = x;
    }
  });
});

describe("sailLuff", () => {
  const belly = [0, 0, -1] as const;
  const at = [1, 8, 3] as const;

  it("does not flutter a full sail", () => {
    for (const t of [0, 0.3, 1.7]) expect(sailLuff(belly, at, t, 1, 1).map(Math.abs)).toEqual([0, 0, 0]);
  });

  it("flutters a slack sail along its belly, by less than the belly", () => {
    const peak = Math.max(...Array.from({ length: 200 }, (_, k) => Math.abs(sailLuff(belly, at, k * 0.013, 0, 1)[2])));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(1);
  });

  it("pins the sail's edges: no belly, no flutter", () => {
    expect(sailLuff([0, 0, 0], at, 0.4, 0, 1).map(Math.abs)).toEqual([0, 0, 0]);
  });

  it("is still without flutter", () => {
    expect(sailLuff(belly, at, 0.4, 0, 0).map(Math.abs)).toEqual([0, 0, 0]);
  });
});

describe("flagRipple", () => {
  const length = 2.5;
  const times = Array.from({ length: 400 }, (_, k) => k * 0.0123);
  const envelope = (u: number) => Math.max(...times.map((t) => Math.abs(flagRipple(u, length, t, 1))));

  it("is zero at the hoist, at every time", () => {
    for (const t of times) expect(Math.abs(flagRipple(0, length, t, 1))).toBe(0);
  });

  it("is greatest at the fly", () => {
    const fly = envelope(1);
    expect(fly).toBeGreaterThan(0);
    for (let u = 0; u < 1; u += 0.05) expect(envelope(u)).toBeLessThan(fly);
  });

  it("reaches FLAG_RIPPLE_SHARE of the cloth's length at the fly, in model metres", () => {
    expect(envelope(1)).toBeCloseTo(FLAG_RIPPLE_SHARE * length, 2);
    expect(envelope(1)).toBeLessThanOrEqual(FLAG_RIPPLE_SHARE * length + 1e-12);
  });

  it("travels from hoist to fly", () => {
    // A crest a little way along the cloth is further along a moment later.
    const crestAt = (t: number) => {
      let best = 0;
      let bestU = 0;
      for (let u = 0.05; u <= 0.95; u += 0.001) {
        const r = flagRipple(u, length, t, 1) / Math.pow(u, FLAG_RIPPLE_GROWTH);
        if (r > best) [best, bestU] = [r, u];
      }
      return bestU;
    };
    expect(crestAt(0.05)).toBeGreaterThan(crestAt(0));
  });

  it("is still without ripple", () => {
    expect(Math.abs(flagRipple(1, length, 0.4, 0))).toBe(0);
  });
});

describe("flagClothPosition", () => {
  const cloth = { hoist: [0.2, 11] as [number, number], along: 2.4, across: 0.05, u: 1, length: 2.5 };

  it("pins the hoist: a vertex on the staff stays where it is", () => {
    for (const heading of HEADINGS.slice(0, 12)) {
      const p = flagClothPosition({ ...cloth, along: 0, across: 0, u: 0 }, 27, flagStreamDirection(heading, SCENE_WIND), 0.3, 1, 0);
      expect(p[0]).toBeCloseTo(0.2, 12);
      expect(p[1]).toBe(27);
      expect(p[2]).toBeCloseTo(11, 12);
    }
  });

  it("streams the fly downwind of the hoist in the world, whatever the heading", () => {
    for (const heading of HEADINGS) {
      const p = flagClothPosition({ ...cloth, across: 0 }, 27, flagStreamDirection(heading, SCENE_WIND), 0, 0, 0);
      const [x, z] = toWorld(heading, [p[0] - cloth.hoist[0], p[2] - cloth.hoist[1]]);
      expect(x / cloth.along).toBeCloseTo(SCENE_WIND.toward[0], 12);
      expect(z / cloth.along).toBeCloseTo(SCENE_WIND.toward[1], 12);
      expect(p[1]).toBe(27);
    }
  });

  it("hangs a limp flag down its staff", () => {
    const p = flagClothPosition(cloth, 27, [0, -1], 0.3, 1, 1);
    expect(p[1]).toBeLessThan(27 - cloth.along * FLAG_LIMP_DROOP * 0.9);
    expect(Math.hypot(p[0] - cloth.hoist[0], p[2] - cloth.hoist[1])).toBeLessThan(cloth.along * 0.5);
  });

  it("keeps the cloth's length", () => {
    const p = flagClothPosition({ ...cloth, across: 0 }, 27, [0.6, -0.8], 0, 0, 0.5);
    expect(Math.hypot(p[0] - cloth.hoist[0], p[1] - 27, p[2] - cloth.hoist[1])).toBeCloseTo(cloth.along, 12);
  });
});

describe("flagNormal", () => {
  it("turns the cloth's normal with it, onto the downwind side", () => {
    // Modelled flying along +X (fly angle 0), normal +Z; streamed toward +Z, the normal turns to −X.
    const [x, y, z] = flagNormal([0, 0, 1], 0, [0, 1]);
    expect(x).toBeCloseTo(-1, 12);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(0, 12);
  });
});

describe("loopRate", () => {
  it("runs a whole number of cycles per wave-clock loop, so the clock's wrap does not jump", () => {
    for (const period of [0.55, 0.8, 3]) {
      const cycles = (loopRate(period) * WAVE_LOOP_SECONDS) / (2 * Math.PI);
      expect(cycles).toBeCloseTo(Math.round(cycles), 9);
      expect(Math.abs((2 * Math.PI) / loopRate(period) - period) / period).toBeLessThan(0.01);
    }
  });
});

describe("shipWindPose", () => {
  it("is pure, and the same at equal wave-clock time (S1): it takes no seed", () => {
    expect(pose()).toEqual(pose());
    expect(pose({ seconds: 3 })).not.toEqual(pose());
  });

  it("streams the flag downwind and fills the sails for the heading", () => {
    const p = pose({ heading: headingOffTheWind(90) });
    expect(p.downwind).toEqual(flagStreamDirection(headingOffTheWind(90), SCENE_WIND));
    expect(p.fullness).toBe(1);
    expect(p.limp).toBe(0);
    expect(p.ripple).toBe(1);
    expect(p.flutter).toBe(1);
    expect(p.seconds).toBe(12.5);
  });

  it("keeps the sails filled at rest: the pose has no speed in it", () => {
    expect(pose({ heading: headingOffTheWind(150) }).fullness).toBe(1);
  });

  it("holds a still, filled pose under reduced motion: two frames are equal", () => {
    const a = pose({ reducedMotion: true, seconds: 1, heading: headingOffTheWind(10) });
    const b = pose({ reducedMotion: true, seconds: 200, heading: headingOffTheWind(10) });
    expect(a).toEqual(b);
    expect(a.fullness).toBe(1);
    expect([a.ripple, a.flutter, a.limp]).toEqual([0, 0, 0]);
  });

  it("lets a sinking ship's flag go limp and its sails slack", () => {
    const a = pose({ sinking: true, heading: headingOffTheWind(180) });
    expect(a.limp).toBe(1);
    expect(a.fullness).toBe(0);
    expect(a.ripple).toBe(0);
    expect(pose({ sinking: true, seconds: 99 })).toEqual(pose({ sinking: true, seconds: 3 }));
  });

  it("writes into a ship's uniforms in place", () => {
    const uniforms = createShipWindUniforms();
    const down = uniforms.uWindDown.value;
    const p = pose();
    writeShipWindPose(uniforms, p);
    expect(uniforms.uWindDown.value).toBe(down);
    expect([...uniforms.uWindDown.value]).toEqual([...p.downwind]);
    expect(uniforms.uSailFullness.value).toBe(p.fullness);
    expect(uniforms.uSailFlutter.value).toBe(p.flutter);
    expect(uniforms.uFlagRipple.value).toBe(p.ripple);
    expect(uniforms.uFlagLimp.value).toBe(p.limp);
    expect(uniforms.uWindSeconds.value).toBe(p.seconds);
  });
});

describe("model metres", () => {
  it("are drawn at ship scale: the shader displaces in the model's frame, which the model's scale carries", () => {
    expect(shipModelScale()).toBeCloseTo(metresToUnits(1) * SHIP_SCALE, 12);
  });
});

describe("injectShipWind", () => {
  const vertexShader = [
    "#include <common>",
    "void main() {",
    "#include <beginnormal_vertex>",
    "#include <begin_vertex>",
    "#include <project_vertex>",
    "}",
  ].join("\n");

  it("binds the ship's uniforms, declares the wind attributes and displaces after begin_vertex", () => {
    const uniforms: Record<string, { value: unknown }> = {};
    const own = createShipWindUniforms();
    const out = injectShipWind({ vertexShader, uniforms }, own);
    expect(uniforms.uWindDown).toBe(own.uWindDown);
    expect(uniforms.uSailFullness).toBe(own.uSailFullness);
    expect(out).toMatch(/attribute vec3 windSail;/);
    expect(out).toMatch(/attribute vec3 windFlagHoist;/);
    expect(out).toMatch(/attribute vec4 windFlagLocal;/);
    const begin = out.indexOf("#include <begin_vertex>");
    const moved = out.indexOf("transformed =", begin);
    expect(begin).toBeGreaterThan(-1);
    expect(moved).toBeGreaterThan(begin);
    expect(out.indexOf("#include <project_vertex>")).toBeGreaterThan(moved);
    expect(out.indexOf("objectNormal")).toBeGreaterThan(out.indexOf("#include <beginnormal_vertex>"));
  });

  it("patches a depth shader, which has no normals, all the same", () => {
    const depth = ["#include <common>", "void main() {", "#include <begin_vertex>", "#include <project_vertex>", "}"].join("\n");
    const out = injectShipWind({ vertexShader: depth, uniforms: {} }, createShipWindUniforms());
    expect(out).toContain("flagClothPosition(");
    expect(out).not.toContain("objectNormal");
  });
});
