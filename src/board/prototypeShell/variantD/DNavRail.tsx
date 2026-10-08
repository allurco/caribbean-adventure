import { ME, ME_RANK_TITLE } from "../fixtures";
import { Seal } from "../primitives";
import type { VariantProps } from "../shellKeys";
import { DIcon } from "./DIcon";
import { activeNav, NAV } from "./nav";
import { FELL, FELL_SC, FOCUS_RING, GARAMOND, TIMBER_V } from "./theme";

/**
 * THROWAWAY PROTOTYPE: variant D's navigation (tablet and up). B's rail cut
 * down to a board that floats at the top left, only as tall as its items,
 * with the harbour showing all round it.
 */
export function DNavRail({ screen, go }: VariantProps) {
  const active = activeNav(screen);
  return (
    <nav aria-label="Main" style={TIMBER_V} className="hidden md:flex absolute left-6 top-6 z-10 w-56 flex-col rounded-[3px] border-2 border-[#1c120a] shadow-[inset_0_1px_0_rgba(255,220,160,0.12),0_12px_28px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="px-5 pt-6 pb-5 border-b border-[#1c120a]/80 shadow-[0_1px_0_rgba(255,220,160,0.06)]">
        <div className={`${FELL_SC} text-[15px] text-[#c9a868] leading-none`}>Caribbean</div>
        <div className={`${FELL} italic text-[34px] text-[#f0dca6] leading-[0.95] [text-shadow:0_2px_0_#120a04]`}>Merchant</div>
      </div>
      <ul className="py-3">
        {NAV.map((n) => {
          const on = n.key === active;
          const disabled = n.key === "profile";
          return (
            <li key={n.key}>
              <button
                onClick={() => n.key !== "profile" && go(n.key)}
                disabled={disabled}
                title={disabled ? "Not built in this prototype" : undefined}
                aria-current={on ? "page" : undefined}
                className={`${FELL_SC} ${FOCUS_RING} relative w-full flex items-center gap-3 px-5 py-2.5 text-[19px] text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "text-[#f6e6b8] bg-[linear-gradient(90deg,rgba(230,199,126,0.18),transparent)]" : "text-[#cfb27a]/80 hover:text-[#f0dca6] hover:bg-white/[0.03]"
                }`}
              >
                {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[4px] bg-[linear-gradient(180deg,#ecd08a,#8c6526)] shadow-[0_0_8px_rgba(230,199,126,0.5)]" />}
                <DIcon name={n.icon} className={`w-5 h-5 ${on ? "text-[#e6c77e]" : ""}`} />
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center gap-3 px-4 py-4 border-t border-[#1c120a]/80 bg-black/20">
        <Seal player={ME} size="md" />
        <div className={`${GARAMOND} min-w-0`}>
          <div className="text-[#f0dca6] text-[16px] leading-tight truncate">{ME.name}</div>
          <div className="text-[#c9a868]/80 text-[14px] lining-nums tabular-nums">
            {ME_RANK_TITLE}, rating {ME.rating}
          </div>
        </div>
      </div>
    </nav>
  );
}
