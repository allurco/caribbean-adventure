/**
 * Hover state shared by every copy of a wrapping world (#36). Each copy
 * reports pointer enter and leave with its own copy number; a leave only
 * clears the hover if it comes from the copy that set it, so moving the
 * pointer from one copy into the next never drops the hover, whichever event
 * arrives first.
 */
export interface SharedHover {
  id: number | null;
  copy: number | null;
}

export const NO_HOVER: SharedHover = { id: null, copy: null };

export function hoverEnter(_state: SharedHover, id: number, copy: number): SharedHover {
  return { id, copy };
}

export function hoverLeave(state: SharedHover, copy: number): SharedHover {
  return state.copy === copy ? NO_HOVER : state;
}
