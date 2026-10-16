import type { Nameboard as NameboardText } from "./shellNav";
import { BOARD_H, NAIL, NAMEBOARD_META, NAMEBOARD_TITLE, ROPE } from "./shellStyles";

const ROPE_LONG = `${ROPE} -top-[60px] h-[60px]`;
const NAIL_BIG = `${NAIL} top-1.5 h-2 w-2`;

/** The screen's title on a timber nameboard hung on ropes over the sheet (#125, desktop). */
export function Nameboard({ title, meta }: NameboardText) {
  return (
    <header className="relative flex shrink-0 justify-center px-3 pt-6 pb-4">
      <div className={`${BOARD_H} relative max-w-[min(100%,560px)] min-w-0 px-5 py-2.5`}>
        <span className={`${ROPE_LONG} left-6`} />
        <span className={`${ROPE_LONG} right-6`} />
        <span className={`${NAIL_BIG} left-[18px]`} />
        <span className={`${NAIL_BIG} right-[18px]`} />
        <h1 className={`${NAMEBOARD_TITLE} truncate text-[38px]`}>
          {title}
        </h1>
        {meta && <p className={`${NAMEBOARD_META} mt-0.5 text-[16px]`}>{meta}</p>}
      </div>
    </header>
  );
}
