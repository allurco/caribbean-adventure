/**
 * Where the dev buoys float (#141, `?buoys=1`): a square of `count` × `count`
 * world points `spacing` apart, centred on the grid point nearest the camera
 * focus. The grid is fixed in the world, so a buoy stays put while the camera
 * pans and only the square jumps by whole spacings.
 */
export function buoyGrid(focus: { x: number; z: number }, count: number, spacing: number): [number, number][] {
  const cx = Math.round(focus.x / spacing);
  const cz = Math.round(focus.z / spacing);
  const first = -Math.floor((count - 1) / 2);
  const out: [number, number][] = [];
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      // `+ 0` turns a −0 into 0.
      out.push([(cx + first + i) * spacing + 0, (cz + first + j) * spacing + 0]);
    }
  }
  return out;
}
