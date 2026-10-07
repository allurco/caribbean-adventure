const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/**
 * Whether `value` is a map seed that names exactly one map: a plain integer
 * within int32. The map generator folds its seed to int32 (`seed | 0`), so
 * anything else (a float, a value outside int32, NaN, a non-number) would
 * silently alias to another seed's map instead of failing. Shared by the
 * dev URL parser and `setup()` (#82).
 */
export function isValidMapSeed(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= INT32_MIN && (value as number) <= INT32_MAX;
}
