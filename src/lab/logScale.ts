/** A slider position 0..1 to a value between `min` and `max` on a log scale (zoom is multiplicative). */
export function fromLogScale(position: number, min: number, max: number): number {
  const t = Math.min(1, Math.max(0, position));
  return min * Math.pow(max / min, t);
}

/** The inverse of `fromLogScale`, clamped to 0..1. */
export function toLogScale(value: number, min: number, max: number): number {
  const t = Math.log(value / min) / Math.log(max / min);
  return Math.min(1, Math.max(0, t));
}
