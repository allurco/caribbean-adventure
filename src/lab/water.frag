// ── FRAGMENT SHADER — LIGHTING + SPECULAR ────────────────────────────────────
// Diffuse = the soft shading (which way the surface faces the light).
// Specular = the sharp sun GLINT (which pixels bounce the sun into your eye).
// Water needs both: diffuse gives it body, specular makes it look WET.

varying vec2 vUv;
uniform float uTime;

// Your wave field, wrapped so we can sample neighbours to measure the slope.
float waveHeight(vec2 p) {
  float wave1 = sin(p.x * 20.0 + uTime * 4.0);
  float wave2 = sin(p.y * 8.0  + uTime * 0.7);
  float wave3 = sin((p.x + p.y) * 20.0 + uTime * 1.5);
  return (wave1 + wave2 + wave3) / 6.0 + 0.5;
}

void main() {
  // ── 1. Surface tilt (normal) ────────────────────────────────────────────────
  float eps = 0.002;
  float h  = waveHeight(vUv);
  float hR = waveHeight(vUv + vec2(eps, 0.0));
  float hU = waveHeight(vUv + vec2(0.0, eps));

  float bumpiness = 3.0;                         // KNOB: how bumpy it looks
  float slopeX = (hR - h) / eps * bumpiness;
  float slopeY = (hU - h) / eps * bumpiness;
  vec3 normal = normalize(vec3(-slopeX, -slopeY, 1.0));

  // ── 2. The light ────────────────────────────────────────────────────────────
  vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));  // KNOB: where the sun is

  // ── 3. DIFFUSE — the soft shading you already built ─────────────────────────
  float diffuse = max(dot(normal, lightDir), 0.0);

  // ── 4. SPECULAR — the sharp sun glint (the "wet" part) ──────────────────────
  // The glint is brightest on pixels whose surface is tilted to bounce the sun
  // STRAIGHT into your eye. On this top-down board the camera looks down, so
  // your eye direction is straight up:
  vec3 viewDir = vec3(0.0, 0.0, 1.0);

  // The tilt that PERFECTLY bounces light → eye points exactly halfway between
  // the light and your eye. That halfway arrow is the "half vector":
  vec3 halfVec = normalize(lightDir + viewDir);

  // YOUR LINE. Build `spec` from three moves you already know:
  //   1. dot(normal, halfVec)  — how much the surface faces that half vector
  //                              (same idea as diffuse, just vs halfVec)
  //   2. max(..., 0.0)         — kill the negatives, exactly like diffuse
  //   3. pow(..., shininess)   — raise it to a power. Raising a 0..1 value to a
  //                              big power crushes everything except values very
  //                              near 1 → only near-perfect pixels stay bright →
  //                              a small, tight, sharp glint.
  float shininess = 64.0;      // KNOB: higher = tighter, sharper glint
  float spec = pow(max(dot(normal, halfVec), 0.0), shininess);            // ← YOU: replace 0.0 (nest the three moves above)

  // ── 5. Paint ────────────────────────────────────────────────────────────────
  vec3 deepWater = vec3(0.02, 0.15, 0.35);
  vec3 crest     = vec3(0.35, 0.75, 0.95);
  vec3 color = mix(deepWater, crest, diffuse);   // softly-shaded water body
  color += vec3(spec);                           // add the white glint on top

  gl_FragColor = vec4(color, 1.0);
}
