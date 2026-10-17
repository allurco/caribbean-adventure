import type { Hex } from "../game/hex";
import { wrappedEquals, wrappedNeighbors } from "../game/hex";
import type { CaribbeanState } from "../game/types";
import { atPort } from "../game/safeHarbour";

/**
 * Two neighbouring hexes of open water, neither a port's docking hex nor in
 * `taken`: where tests set two ships alongside for a fight, since ships start
 * docked and there is no fighting in port (#388). With `from`, the first is
 * `from` itself (wherever it is) and the second open water beside it.
 */
export function openWaterPair(G: Pick<CaribbeanState, "cells" | "wrap">, taken: readonly Hex[] = [], from?: Hex): [Hex, Hex] {
  const free = (h: Hex) =>
    G.cells.some((c) => c.terrain === "water" && wrappedEquals(c.hex, h, G.wrap)) &&
    !atPort(G, h) &&
    !taken.some((t) => wrappedEquals(t, h, G.wrap));
  if (from) {
    const beside = wrappedNeighbors(from, G.wrap).find(free);
    if (beside) return [from, beside];
    throw new Error("no open water beside the given hex");
  }
  for (const cell of G.cells) {
    if (!free(cell.hex)) continue;
    const beside = wrappedNeighbors(cell.hex, G.wrap).find(free);
    if (beside) return [cell.hex, beside];
  }
  throw new Error("no open water for a fight");
}
