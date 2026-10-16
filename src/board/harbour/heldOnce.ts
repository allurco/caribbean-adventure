/** A value built once and kept while something holds it (createHeldOnce). */
export interface HeldOnce<T> {
  /** The value, built on the first ask after it was let go (or ever). */
  once: () => T;
  /** Keeps `value` until the returned release; a release lets it go unless a newer value has replaced it. */
  hold: (value: T) => () => void;
}

/**
 * A value built once and shared, then let go when its holder releases it, so
 * whatever it keeps alive can be collected (#122: the harbour's world, which
 * keeps every per-map cache of its map). Releasing and holding again at once,
 * as StrictMode's double effects do, keeps the same value.
 */
export function createHeldOnce<T>(build: () => T): HeldOnce<T> {
  let current: { value: T } | undefined;
  return {
    once: () => {
      current ??= { value: build() };
      return current.value;
    },
    hold: (value) => {
      current ??= { value };
      return () => {
        if (current?.value === value) current = undefined;
      };
    },
  };
}
