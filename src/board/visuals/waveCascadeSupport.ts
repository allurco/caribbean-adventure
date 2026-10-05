/**
 * Which render-target types the FFT wave cascade can use on this GPU (#38).
 *
 * In WebGL2, rendering into a float or half-float colour target needs an
 * extension: EXT_color_buffer_float (covers both) or
 * EXT_color_buffer_half_float (half float only). The cascade's output target
 * is half float and has its mipmaps generated, so it must be renderable too.
 * With neither extension every cascade framebuffer is incomplete, so the
 * cascade is skipped (`null`) rather than drawn into targets that silently
 * fail.
 */

export interface ColorBufferSupport {
  colorBufferFloat: boolean;
  colorBufferHalfFloat: boolean;
}

export interface CascadeTargetTypes {
  /** The spectrum and FFT ping-pong targets. */
  work: "float" | "half";
  /** The mipmapped slope texture. */
  output: "half";
}

export function cascadeTargetTypes(support: ColorBufferSupport): CascadeTargetTypes | null {
  if (support.colorBufferFloat) return { work: "float", output: "half" };
  if (support.colorBufferHalfFloat) return { work: "half", output: "half" };
  return null;
}
