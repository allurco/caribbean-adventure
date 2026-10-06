import { describe, expect, it } from "vitest";
import {
  DISPLACED_SIGNIFICANT_HEIGHT_METRES,
  DISPLACEMENT_CASCADES,
  DISPLACEMENT_FULL_DEPTH_METRES,
  DISPLACEMENT_LOD_BIAS,
  WAVE_CREST_BOUND_UNITS,
  WAVE_DISPLACEMENT_GLSL,
  WAVE_HEIGHT_GAIN,
  bindWaveDisplacementTextures,
  displacementLod,
  shallowDisplacementDamping,
  turnDisplacementToWorld,
} from "./waveDisplacement";
import { WAVE_CASCADES } from "./oceanWaves";
import { resolvedHeightVariance } from "./waveCascade";
import { BREAKING_DEPTH_METRES } from "./shoreFoam";
import { METRES_PER_UNIT } from "./worldScale";

describe("DISPLACEMENT_CASCADES", () => {
  it("are the largest tiles, longest waves first", () => {
    expect(DISPLACEMENT_CASCADES[0]).toBe(0);
    for (let i = 1; i < DISPLACEMENT_CASCADES.length; i++) {
      expect(DISPLACEMENT_CASCADES[i]).toBe(DISPLACEMENT_CASCADES[i - 1] + 1);
    }
    expect(DISPLACEMENT_CASCADES.length).toBeLessThan(WAVE_CASCADES.length);
  });

  it("carry nearly all of the sea's height: the undisplaced bands hold under 1% of the variance", () => {
    const total = WAVE_CASCADES.reduce((sum, c) => sum + resolvedHeightVariance(c), 0);
    const displaced = DISPLACEMENT_CASCADES.reduce((sum, i) => sum + resolvedHeightVariance(WAVE_CASCADES[i]), 0);
    expect(displaced / total).toBeGreaterThan(0.99);
  });

  it("give a significant height of a moderate sea, a decimetre or two short of the whole spectrum's", () => {
    expect(DISPLACED_SIGNIFICANT_HEIGHT_METRES).toBeGreaterThan(1.2);
    expect(DISPLACED_SIGNIFICANT_HEIGHT_METRES).toBeLessThan(2);
  });
});

describe("WAVE_HEIGHT_GAIN and the crest bound", () => {
  it("draws the physical height: no visual gain", () => {
    expect(WAVE_HEIGHT_GAIN).toBe(1);
  });

  it("bounds the crests at the significant height in world units: a few centimetres of a unit", () => {
    expect(WAVE_CREST_BOUND_UNITS).toBeCloseTo((DISPLACED_SIGNIFICANT_HEIGHT_METRES * WAVE_HEIGHT_GAIN) / METRES_PER_UNIT, 12);
    expect(WAVE_CREST_BOUND_UNITS).toBeGreaterThan(0.015);
    expect(WAVE_CREST_BOUND_UNITS).toBeLessThan(0.035);
  });
});

describe("shallowDisplacementDamping", () => {
  it("is full seaward of twice the breaking depth and nothing at the waterline or on land", () => {
    expect(DISPLACEMENT_FULL_DEPTH_METRES).toBeCloseTo(2 * BREAKING_DEPTH_METRES, 12);
    expect(shallowDisplacementDamping(0)).toBe(0);
    expect(shallowDisplacementDamping(-3)).toBe(0);
    expect(shallowDisplacementDamping(DISPLACEMENT_FULL_DEPTH_METRES)).toBe(1);
    expect(shallowDisplacementDamping(60)).toBe(1);
  });

  it("rises smoothly and monotonically", () => {
    let previous = 0;
    for (let d = 0; d <= DISPLACEMENT_FULL_DEPTH_METRES; d += 0.05) {
      const damping = shallowDisplacementDamping(d);
      expect(damping).toBeGreaterThanOrEqual(previous);
      previous = damping;
    }
    // Quadratic at the start (a smoothstep), so the shore sees almost nothing.
    expect(shallowDisplacementDamping(0.5)).toBeLessThan(0.05);
  });

  it("never lets a trough reach the seabed: the damped significant height stays under the depth", () => {
    for (let d = 0.05; d <= 2 * DISPLACEMENT_FULL_DEPTH_METRES; d += 0.05) {
      expect(DISPLACED_SIGNIFICANT_HEIGHT_METRES * WAVE_HEIGHT_GAIN * shallowDisplacementDamping(d)).toBeLessThan(d);
    }
  });
});

describe("displacementLod", () => {
  it("reads the base level where the grid cell is finer than the texel and coarser levels as the cell grows", () => {
    expect(displacementLod(1, 5.7)).toBe(0);
    expect(displacementLod(5.7, 5.7)).toBeCloseTo(DISPLACEMENT_LOD_BIAS, 12);
    expect(displacementLod(16 * 5.7, 5.7)).toBeCloseTo(4 + DISPLACEMENT_LOD_BIAS, 12);
  });

  it("is monotonic in the cell size", () => {
    let previous = 0;
    for (let cell = 1; cell < 200; cell *= 1.3) {
      const lod = displacementLod(cell, 5.7);
      expect(lod).toBeGreaterThanOrEqual(previous);
      previous = lod;
    }
  });
});

describe("turnDisplacementToWorld", () => {
  it("turns a tile-axis displacement by the tile's rotation, like the slopes", () => {
    const [x, z] = turnDisplacementToWorld([1, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
    const [x2, z2] = turnDisplacementToWorld([0.3, -0.2], 0);
    expect([x2, z2]).toEqual([0.3, -0.2]);
  });
});

describe("WAVE_DISPLACEMENT_GLSL", () => {
  it("declares one displacement texture per displaced cascade, with its tile, turn, texel and band start", () => {
    for (const c of DISPLACEMENT_CASCADES) {
      const cascade = WAVE_CASCADES[c];
      expect(WAVE_DISPLACEMENT_GLSL).toContain(`uniform sampler2D waveDisplacement${c};`);
      expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float WAVE_DISP_TILE_UNITS_${c} = ${(cascade.tileMetres / METRES_PER_UNIT).toFixed(8)};`);
      expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float WAVE_DISP_TEXEL_METRES_${c} = ${(cascade.tileMetres / cascade.size).toFixed(8)};`);
      expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float WAVE_DISP_K_MIN_${c} = ${cascade.kMin.toFixed(8)};`);
      expect(WAVE_DISPLACEMENT_GLSL).toContain(`textureLod(waveDisplacement${c}, uv, displacementLod(cellMetres, WAVE_DISP_TEXEL_METRES_${c}))`);
    }
    expect(WAVE_DISPLACEMENT_GLSL).not.toContain("waveDisplacement2");
  });

  it("carries the constants and the damping and lod functions", () => {
    expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float WAVE_HEIGHT_GAIN = ${WAVE_HEIGHT_GAIN.toFixed(4)};`);
    expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float DISPLACEMENT_FULL_DEPTH_METRES = ${DISPLACEMENT_FULL_DEPTH_METRES.toFixed(4)};`);
    expect(WAVE_DISPLACEMENT_GLSL).toContain(`const float DISPLACEMENT_LOD_BIAS = ${DISPLACEMENT_LOD_BIAS.toFixed(4)};`);
    expect(WAVE_DISPLACEMENT_GLSL).toContain("float shallowDisplacementDamping(float depthMetres)");
    expect(WAVE_DISPLACEMENT_GLSL).toContain("vec3 waveSurfaceDisplacement(vec2 restXZ, float cellUnits)");
  });

  it("turns the horizontal pull into world axes by the tile's turn", () => {
    expect(WAVE_DISPLACEMENT_GLSL).toContain("vec3(turn.x * t.y - turn.y * t.z, t.x, turn.y * t.y + turn.x * t.z)");
  });
});

describe("bindWaveDisplacementTextures", () => {
  it("attaches each texture to its cascade's uniform, in DISPLACEMENT_CASCADES order", () => {
    const uniforms: Record<string, { value: unknown }> = {};
    const textures = DISPLACEMENT_CASCADES.map((c) => ({ id: c }));
    bindWaveDisplacementTextures(uniforms, textures);
    DISPLACEMENT_CASCADES.forEach((c, i) => expect(uniforms[`waveDisplacement${c}`].value).toBe(textures[i]));
  });

  it("refuses the wrong number of textures", () => {
    expect(() => bindWaveDisplacementTextures({}, [])).toThrow(RangeError);
  });
});
