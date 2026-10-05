import type { MapWrap } from "../../game/hex";
import type { MapCell } from "../../game/types";

const sameWrap = (a: MapWrap, b: MapWrap): boolean => (a?.columns ?? null) === (b?.columns ?? null);

/**
 * Wraps a per-map build (the land mesh, decoration placement) so it runs once
 * per `cells` array and wrap, however often it is asked for. A `useMemo`
 * alone is not enough: the board's tree is thrown away and rendered again
 * while drei's text suspends on its font, and every world copy (#36) would
 * otherwise build its own. Keep the cached value CPU-side (plain arrays);
 * GPU objects made from it belong to the component that disposes them.
 */
export function perMapCache<T>(build: (cells: readonly MapCell[], wrap: MapWrap) => T) {
  const cache = new WeakMap<readonly MapCell[], { wrap: MapWrap; value: T }>();
  return (cells: readonly MapCell[], wrap: MapWrap): T => {
    const cached = cache.get(cells);
    if (cached && sameWrap(cached.wrap, wrap)) return cached.value;
    const value = build(cells, wrap);
    cache.set(cells, { wrap, value });
    return value;
  };
}
