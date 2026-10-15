import type { Nameboard as NameboardText } from "./shellNav";
import { BOARD_H } from "./shellStyles";

const ROPE =
  "absolute -top-[60px] h-[60px] w-[3px] bg-[repeating-linear-gradient(35deg,#d4b47a_0_2px,#7a5a2e_2px_4px)] shadow-[1px_0_2px_rgba(0,0,0,0.4)]";
const NAIL = "absolute top-1.5 h-2 w-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d999,#6b4a18)]";

/** The screen's title on a timber nameboard hung on ropes over the sheet (#125, desktop). */
export function Nameboard({ title, meta }: NameboardText) {
  return (
    <header className="relative flex shrink-0 justify-center px-3 pt-6 pb-4">
      <div className={`${BOARD_H} relative max-w-[min(100%,560px)] min-w-0 px-5 py-2.5`}>
        <span className={`${ROPE} left-6`} />
        <span className={`${ROPE} right-6`} />
        <span className={`${NAIL} left-[18px]`} />
        <span className={`${NAIL} right-[18px]`} />
        <h1 className="truncate font-fell-sc text-[38px] leading-none text-[#f0d79a] [text-shadow:0_-1px_0_rgba(0,0,0,0.8),0_1px_0_rgba(255,226,160,0.18)]">
          {title}
        </h1>
        {meta && <p className="mt-0.5 truncate font-garamond text-[16px] text-[#d9c08a]/85 italic">{meta}</p>}
      </div>
    </header>
  );
}
