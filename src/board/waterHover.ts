import { hoverEnter, hoverLeave, NO_HOVER, type SharedHover } from "./sharedHover";

/**
 * The two hovers over the water (#239), shared by every world copy (#36):
 * `target`, the move or attack target under the pointer, only while the
 * board is interactive; and `sea`, whatever water hex is under it, for the
 * region tooltip, whoever's turn it is and whatever is clickable.
 */
export interface WaterHover {
  target: SharedHover;
  sea: SharedHover;
}

export const NO_WATER_HOVER: WaterHover = { target: NO_HOVER, sea: NO_HOVER };

const enter = (h: SharedHover, id: number, copy: number) => (h.id === id && h.copy === copy ? h : hoverEnter(h, id, copy));

/**
 * The pointer moved over water hex `id` (an index into the water cells) in
 * world copy `copy`. When not `interactive` the target hover is left as it
 * is. Returns `state` itself when nothing changed.
 */
export function waterPointerMove(
  state: WaterHover,
  id: number,
  copy: number,
  targets: ReadonlySet<number>,
  interactive: boolean
): WaterHover {
  const sea = enter(state.sea, id, copy);
  const target = !interactive ? state.target : targets.has(id) ? enter(state.target, id, copy) : hoverLeave(state.target, copy);
  return sea === state.sea && target === state.target ? state : { target, sea };
}

/** The pointer left the water of world copy `copy`. */
export function waterPointerOut(state: WaterHover, copy: number): WaterHover {
  const target = hoverLeave(state.target, copy);
  const sea = hoverLeave(state.sea, copy);
  return sea === state.sea && target === state.target ? state : { target, sea };
}
