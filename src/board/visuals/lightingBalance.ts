/**
 * How much light a `Lighting` puts on a matte facet, as a luminance, the way
 * three lights a MeshStandardMaterial (#169): the sun and the fill by
 * Lambert's N·L, the ambient hemisphere by its sky and ground colours mixed
 * on the facet's normal, and the sky map by its clear-sky diffuse share of
 * the sun (skyEnvironmentIntensity), seen over the facet's view of the sky,
 * (1 + n.y) / 2. The sea's bounce below the horizon is left out, so a
 * tilted facet's figure is on the low side.
 *
 * It is a model to tune and pin the balance between sunlit and shaded faces
 * against, not a renderer: colour is reduced to luminance, shadows ignored.
 */

import type { Lighting } from "./lighting";
import type { Vec3 } from "./sunDirection";

const srgbToLinear = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** Relative luminance (linear, Rec. 709) of a "#rrggbb" colour. */
export function hexLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgbToLinear((n >> 16) & 255) + 0.7152 * srgbToLinear((n >> 8) & 255) + 0.0722 * srgbToLinear(n & 255)
  );
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalise = (v: Vec3): Vec3 => {
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
};

/** Luminance of the irradiance `lighting` puts on a facet with `normal` (any length). */
export function lightOnFacet(lighting: Lighting, normal: Vec3): number {
  const n = normalise(normal);
  const { sun, fill, ambient, sky } = lighting;
  const direct = (light: typeof sun) => hexLuminance(light.color) * light.intensity * Math.max(0, dot(n, light.direction));
  const sunHorizontal = sun.intensity * Math.max(0, Math.sin((sun.elevationDeg * Math.PI) / 180));
  const skyHorizontal = (sky.diffuseFraction / (1 - sky.diffuseFraction)) * sunHorizontal;
  const up = (1 + n[1]) / 2;
  const hemisphere =
    ambient.intensity * (hexLuminance(ambient.groundColor) * (1 - up) + hexLuminance(ambient.skyColor) * up);
  return direct(sun) + direct(fill) + skyHorizontal * up + hemisphere;
}
