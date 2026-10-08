import type { ReactNode } from "react";
import { FELL_SC, GARAMOND, TIMBER_H } from "./theme";

const ROPE = "absolute -top-[60px] h-[60px] w-[3px] bg-[repeating-linear-gradient(35deg,#d4b47a_0_2px,#7a5a2e_2px_4px)] shadow-[1px_0_2px_rgba(0,0,0,0.4)]";

/**
 * THROWAWAY PROTOTYPE: the head of variant D's content column. The screen's
 * title hangs over the harbour on a roped nameboard above the sheet.
 */
export function DWindowBand({ title, meta, aside }: { title: string; meta: string; aside?: ReactNode }) {
  return (
    <header className="relative shrink-0 h-[170px] md:h-auto md:pt-6 md:pb-4 px-4 md:px-3 flex items-end justify-between md:justify-center gap-3 pb-5">
      <div style={TIMBER_H} className="relative min-w-0 max-w-[min(100%,560px)] px-4 md:px-5 py-2 md:py-2.5 border-2 border-[#1c120a] rounded-[3px] shadow-[inset_0_1px_0_rgba(255,220,160,0.12),0_10px_24px_rgba(0,0,0,0.5)]">
        <span className={`${ROPE} left-6`} />
        <span className={`${ROPE} right-6`} />
        <span className="absolute top-1.5 left-[18px] w-2 h-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d999,#6b4a18)]" />
        <span className="absolute top-1.5 right-[18px] w-2 h-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d999,#6b4a18)]" />
        <h1 className={`${FELL_SC} text-[25px] md:text-[38px] leading-none text-[#f0d79a] truncate [text-shadow:0_-1px_0_rgba(0,0,0,0.8),0_1px_0_rgba(255,226,160,0.18)]`}>{title}</h1>
        {meta && <p className={`${GARAMOND} italic text-[14px] md:text-[16px] text-[#d9c08a]/85 mt-0.5 line-clamp-2 md:truncate`}>{meta}</p>}
      </div>
      {aside && <div className="md:hidden shrink-0 mb-1">{aside}</div>}
    </header>
  );
}
