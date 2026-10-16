import type { Nameboard } from "./shellNav";
import { BOARD_H, NAIL, NAMEBOARD_META, NAMEBOARD_TITLE, ROPE } from "./shellStyles";

const ROPE_SHORT = `${ROPE} bottom-full h-3`;
const NAIL_SMALL = `${NAIL} top-1 h-1.5 w-1.5`;

/**
 * The nameboard cut down for a phone held sideways (#125): one line, hung on
 * short ropes, so the sheet keeps the height. The line after the title gives
 * way first when the board runs out of room.
 */
export function NameboardShort({ title, meta }: Nameboard) {
  return (
    <div className={`${BOARD_H} relative flex max-w-full min-w-0 items-baseline gap-3 px-6 py-1.5`}>
      <span className={`${ROPE_SHORT} left-[10.5px]`} />
      <span className={`${ROPE_SHORT} right-[10.5px]`} />
      <span className={`${NAIL_SMALL} left-[9px]`} />
      <span className={`${NAIL_SMALL} right-[9px]`} />
      <h1 className={`${NAMEBOARD_TITLE} shrink-0 text-[22px]`}>
        {title}
      </h1>
      {meta && <p className={`${NAMEBOARD_META} min-w-0 text-[14px]`}>{meta}</p>}
    </div>
  );
}
