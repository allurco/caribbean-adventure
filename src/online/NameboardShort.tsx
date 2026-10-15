import type { Nameboard } from "./shellNav";
import { BOARD_H } from "./shellStyles";

const ROPE =
  "absolute bottom-full h-3 w-[3px] bg-[repeating-linear-gradient(35deg,#d4b47a_0_2px,#7a5a2e_2px_4px)] shadow-[1px_0_2px_rgba(0,0,0,0.4)]";
const NAIL = "absolute top-1 h-1.5 w-1.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d999,#6b4a18)]";

/**
 * The nameboard cut down for a phone held sideways (#125): one line, hung on
 * short ropes, so the sheet keeps the height. The line after the title gives
 * way first when the board runs out of room.
 */
export function NameboardShort({ title, meta }: Nameboard) {
  return (
    <div className={`${BOARD_H} relative flex max-w-full min-w-0 items-baseline gap-3 px-6 py-1.5`}>
      <span className={`${ROPE} left-[10.5px]`} />
      <span className={`${ROPE} right-[10.5px]`} />
      <span className={`${NAIL} left-[9px]`} />
      <span className={`${NAIL} right-[9px]`} />
      <h1 className="shrink-0 font-fell-sc text-[22px] leading-none text-[#f0d79a] [text-shadow:0_-1px_0_rgba(0,0,0,0.8),0_1px_0_rgba(255,226,160,0.18)]">
        {title}
      </h1>
      {meta && <p className="min-w-0 truncate font-garamond text-[14px] text-[#d9c08a]/85 italic">{meta}</p>}
    </div>
  );
}
