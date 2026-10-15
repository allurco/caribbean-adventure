/**
 * The shader of the combat's soft puffs (#263): smoke, muzzle flash, spray,
 * mist and foam, one instanced quad each. A puff faces the camera (a
 * billboard), stretched sideways for a bank of smoke, or lies flat on the
 * sea for foam. Its edge is lumpy and different for every puff, so the
 * clouds read as billows rather than discs, and it is lit from the sun's side.
 */
export const PUFF_VERTEX = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iSize;
  attribute float iAlpha;
  attribute float iSeed;
  uniform float uStretch;
  uniform float uFlat;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vAlpha = iAlpha;
    vSeed = iSeed;
    float a = iSeed * 6.2831;
    vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy;
    vec4 mvPosition;
    if (uFlat > 0.5) {
      // Lying on the sea: the quad in world x and z.
      mvPosition = modelViewMatrix * vec4(iOffset + vec3(p.x, 0.0, p.y) * iSize, 1.0);
    } else {
      mvPosition = modelViewMatrix * vec4(iOffset, 1.0);
      mvPosition.xy += vec2(p.x * uStretch, p.y) * iSize;
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const PUFF_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uSunView;
  uniform float uLit;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float lump = 0.09 * sin(ang * 3.0 + vSeed * 31.0) + 0.06 * sin(ang * 5.0 - vSeed * 17.0) + 0.04 * sin(ang * 9.0 + vSeed * 7.0);
    float body = 1.0 - smoothstep(0.3 + lump, 0.95 + lump * 0.5, r);
    if (body <= 0.002) discard;
    vec3 n = normalize(vec3(p, sqrt(max(0.0, 1.0 - r * r)) + 0.35));
    float light = clamp(dot(n, uSunView) * 0.6 + 0.5, 0.0, 1.0);
    vec3 colour = mix(uColor, mix(uShade, uColor, light), uLit);
    gl_FragColor = vec4(colour, body * vAlpha);
    #include <fog_fragment>
  }
`;
