/**
 * Checks for move arguments, which are untrusted: online, the `/api`
 * reducer runs on whatever a client sends, so a number may be fractional,
 * NaN or a string, a choice may be outside its set, and an id may name an
 * inherited property ("__proto__") rather than an entry.
 */

/** A whole number above zero: an amount of goods, gold or repair points. */
export function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

/** A whole number (a hex coordinate). */
export function isWhole(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/** A position in `list`. */
export function isIndexOf(list: readonly unknown[], i: unknown): i is number {
  return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < list.length;
}

/** One of `values`. */
export function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

/** An id that names an entry of `record` itself, never an inherited property. */
export function isOwnKey(record: object, id: unknown): id is string {
  return typeof id === "string" && Object.hasOwn(record, id);
}
