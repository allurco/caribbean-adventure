/**
 * The colour of a light by its temperature, for naming a sun "~3200 K"
 * instead of a bare hex. Tanner Helland's fit to the CIE 1964 blackbody
 * table, in sRGB bytes; good to a few levels between 1000 K and 40000 K,
 * which is all a look needs.
 */

const clampByte = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));

/** sRGB bytes of a blackbody at `kelvin`. */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clampByte(r), clampByte(g), clampByte(b)];
}

/** "#rrggbb" of a blackbody at `kelvin`. */
export function kelvinToHex(kelvin: number): string {
  return `#${kelvinToRgb(kelvin)
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}
