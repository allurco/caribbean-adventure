import { describe, expect, it } from "vitest";
import { WAVE_CASCADES, WAVE_CHOPPINESS } from "./oceanWaves";
import { windInTile } from "./waveCascade";
import {
  DISPLACEMENT_OUTPUT_FRAGMENT,
  SLOPE_OUTPUT_FRAGMENT,
  spectrumFragment,
  WHITECAP_ACCUMULATE_FRAGMENT,
} from "./waveCascadeShaders";

describe("spectrumFragment", () => {
  const source = spectrumFragment(WAVE_CASCADES, 256, [0, 1]);

  it("lays the displacement blocks after the cascades' own and maps each back to its cascade's h0", () => {
    expect(source).toContain("const int CASCADES = 3;");
    expect(source).toContain("const int DISPLACED[2] = int[2](0, 1);");
    expect(source).toContain("int block = p.x / SIZE;");
    expect(source).toContain("bool displacement = block >= CASCADES;");
    expect(source).toContain("int cascade = displacement ? DISPLACED[block - CASCADES] : block;");
    expect(source).toContain("vec4 h0 = texelFetch(initialSpectrum, ivec2(cascade * SIZE, 0) + t, 0);");
  });

  it("writes P = h̃ (1 − λ kx/|k|) and Q = i λ kz/|k| h̃ in a displacement block (waveCascade.ts)", () => {
    expect(source).toContain("gl_FragColor = vec4(h * (1.0 - CHOPPINESS * k.x / kLen), cmul(h, vec2(0.0, CHOPPINESS * k.y / kLen)));");
  });

  it("needs no displacement array when nothing is displaced", () => {
    const flat = spectrumFragment(WAVE_CASCADES, 256, []);
    expect(flat).not.toContain("DISPLACED");
    expect(flat).toContain("int cascade = block;");
  });

  it("declares each cascade's wind direction in its tile's axes and the choppiness", () => {
    const winds = WAVE_CASCADES.map((c) => {
      const [x, z] = windInTile(c);
      return `vec2(${x.toFixed(8)}, ${z.toFixed(8)})`;
    }).join(", ");
    expect(source).toContain(`const vec2 WIND_IN_TILE[${WAVE_CASCADES.length}] = vec2[${WAVE_CASCADES.length}](${winds});`);
    expect(source).toContain(`const float CHOPPINESS = ${WAVE_CHOPPINESS.toFixed(8)};`);
  });

  it("packs the slopes in RG and the stretch along and across the wind in BA: −λ h̃ ((k·u)², (k·v)²) / |k|", () => {
    expect(source).toContain("vec2 u = WIND_IN_TILE[cascade];");
    expect(source).toContain("float along = dot(k, u);");
    expect(source).toContain("float across = dot(k, vec2(-u.y, u.x));");
    expect(source).toContain("float kLen = max(length(k), 1e-6);");
    expect(source).toContain("vec2 stretch = -CHOPPINESS * vec2(along * along, across * across) / kLen;");
    expect(source).toContain("gl_FragColor = vec4(cmul(h, vec2(-k.y, k.x)), cmul(h, stretch));");
  });

  it("refuses cascades of different grid sizes", () => {
    expect(() => spectrumFragment([WAVE_CASCADES[0], { ...WAVE_CASCADES[1], size: 128 }], 256, [])).toThrow(RangeError);
  });

  it("refuses a displaced cascade that is not in the atlas", () => {
    expect(() => spectrumFragment(WAVE_CASCADES, 256, [3])).toThrow(RangeError);
  });
});

describe("SLOPE_OUTPUT_FRAGMENT", () => {
  it("writes the slope, its square and the Jacobian of the stretch", () => {
    expect(SLOPE_OUTPUT_FRAGMENT).toContain("vec4 texel = texelFetch(source, ivec2(gl_FragCoord.xy) + ivec2(column, 0), 0);");
    expect(SLOPE_OUTPUT_FRAGMENT).toContain("gl_FragColor = vec4(texel.xy, dot(texel.xy, texel.xy), surfaceJacobian(texel.zw));");
  });
});

describe("DISPLACEMENT_OUTPUT_FRAGMENT", () => {
  it("writes the height and the x and z displacement from its block, texel for texel", () => {
    expect(DISPLACEMENT_OUTPUT_FRAGMENT).toContain("vec4 texel = texelFetch(source, ivec2(gl_FragCoord.xy) + ivec2(column, 0), 0);");
    expect(DISPLACEMENT_OUTPUT_FRAGMENT).toContain("gl_FragColor = vec4(texel.xyz, 0.0);");
  });
});

describe("WHITECAP_ACCUMULATE_FRAGMENT", () => {
  it("adds this frame's fold of the cascade's Jacobian to the decayed previous foam, texel for texel", () => {
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("uniform sampler2D jacobian;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("uniform sampler2D previous;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("uniform float decay;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("uniform float injection;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("float j = texelFetch(jacobian, p, 0).a;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("float foam = texelFetch(previous, p, 0).r;");
    expect(WHITECAP_ACCUMULATE_FRAGMENT).toContain("gl_FragColor = vec4(accumulateWhitecap(foam, j, decay, injection), 0.0, 0.0, 1.0);");
  });
});
