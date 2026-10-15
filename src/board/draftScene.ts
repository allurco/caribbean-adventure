import type { CaribbeanState } from "../game/types";

/**
 * The state the 3D scene draws. The scene is mounted from the start, behind
 * the loading screen and then the captain draft, so it is fully loaded and
 * compiled before play (useSceneReadiness.ts). During the draft the player
 * ships wait at the origin with no captain, class or home port yet: they are
 * left out until their captain is picked.
 */
export function sceneStateFor(G: CaribbeanState, phase: string): CaribbeanState {
  if (phase !== "draft") return G;
  const ships = Object.fromEntries(Object.entries(G.ships).filter(([, ship]) => ship.captain !== undefined));
  return { ...G, ships };
}
