// ── VERTEX SHADER ────────────────────────────────────────────────────────────
// Runs once per CORNER of the geometry (this plane has 4 corners).
// Its job here is simply to stretch one flat rectangle across the whole screen.
//
// Don't edit this yet — just read it once so the fragment shader makes sense.
//
// `position` and `uv` are fed in automatically by Three.js for every corner:
//   position = the corner's location. Our plane spans -1..1, which happens to be
//              exactly the screen's edges, so the rectangle fills the viewport.
//   uv       = a 0..1 coordinate. (0,0) is bottom-left, (1,1) is top-right.

varying vec2 vUv;   // "varying" = a value we hand off to the fragment shader.

void main() {
  vUv = uv;                                    // pass the corner's uv onward
  gl_Position = vec4(position.xy, 0.0, 1.0);   // place the corner on screen
}
