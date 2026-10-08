import { FELL_SC, GARAMOND, TIMBER_H } from "../theme";

const ROPE = "absolute bottom-full h-3 w-[3px] bg-[repeating-linear-gradient(35deg,#d4b47a_0_2px,#7a5a2e_2px_4px)] shadow-[1px_0_2px_rgba(0,0,0,0.4)]";
const NAIL = "absolute top-1 w-1.5 h-1.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d999,#6b4a18)]";

/**
 * THROWAWAY PROTOTYPE: variant D's hanging nameboard cut down for a phone
 * held sideways. Same timber, ropes and brass nails, but one line tall,
 * hung on short ropes from the top of the screen, so the sheet below keeps
 * the height. The subtitle follows the title on the same line and gives way
 * first when the board runs out of room.
 */
export function DShortSign({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={TIMBER_H} className="relative min-w-0 max-w-full flex items-baseline gap-3 px-6 py-1.5 border-2 border-[#1c120a] rounded-[3px] shadow-[inset_0_1px_0_rgba(255,220,160,0.12),0_8px_18px_rgba(0,0,0,0.5)]">
      {/* ropes and nails sit in the corners, clear of the lettering */}
      <span className={`${ROPE} left-[10.5px]`} />
      <span className={`${ROPE} right-[10.5px]`} />
      <span className={`${NAIL} left-[9px]`} />
      <span className={`${NAIL} right-[9px]`} />
      <h1 className={`${FELL_SC} shrink-0 text-[22px] leading-none text-[#f0d79a] [text-shadow:0_-1px_0_rgba(0,0,0,0.8),0_1px_0_rgba(255,226,160,0.18)]`}>{title}</h1>
      {meta && <p className={`${GARAMOND} min-w-0 italic text-[14px] text-[#d9c08a]/85 truncate`}>{meta}</p>}
    </div>
  );
}
