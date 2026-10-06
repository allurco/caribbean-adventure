/** Where every decoration stands, worked out once per map and shared by every world copy (#36). */
import { useMemo } from "react";
import type { MapCell } from "../../game/types";
import type { MapWrap } from "../../game/hex";
import { decorationLayoutOf, type DecorationPlacements } from "./decorationLayout";
import { usePalmTrees, type PalmTreesResources } from "./usePalmTrees";
import { useShrubs, type ShrubsResources } from "./useShrubs";
import { useSwayClock } from "./useSwayClock";

export { ROCK_RADIUS, type DecorationData } from "./decorationLayout";

/** The placements (`decorationLayout.ts`) with the palms' and shrubs' GPU resources built on them. */
export interface DecorationLayout extends Omit<DecorationPlacements, "shrubs"> {
  palms: PalmTreesResources;
  /** Derived bushes and dry tufts on sand and grass cells (#49). */
  shrubs: ShrubsResources;
}

/** Places every decoration on the height field once per map (and wrap). */
export function useDecorationLayout(cells: MapCell[], wrap: MapWrap): DecorationLayout {
  // Collect all decorations with their world positions
  const decorationsByType = decorationLayoutOf(cells, wrap);
  // One clock for everything that sways, so reduced motion stops palms and shrubs together.
  const sway = useSwayClock();
  const palms = usePalmTrees(decorationsByType.trees, sway);
  const shrubs = useShrubs(decorationsByType.shrubs, sway);
  return useMemo(() => ({ ...decorationsByType, palms, shrubs }), [decorationsByType, palms, shrubs]);
}
