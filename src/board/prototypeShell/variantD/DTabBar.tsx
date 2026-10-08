import { PARTY } from "../fixtures";
import type { VariantProps } from "../shellKeys";
import { DIcon } from "./DIcon";
import { activeNav, NAV } from "./nav";
import { FELL_SC, FOCUS_RING, TIMBER_H } from "./theme";

/**
 * THROWAWAY PROTOTYPE: the rail folded into a bottom tab bar under 768 px.
 * The Party tab carries the crew count so the dock is one thumb away.
 */
export function DTabBar({ screen, go }: VariantProps) {
  const active = activeNav(screen);
  return (
    <nav aria-label="Main" style={TIMBER_H} className="md:hidden absolute inset-x-0 bottom-0 z-20 flex border-t-[3px] border-[#1c120a] shadow-[0_-6px_18px_rgba(0,0,0,0.45)] pb-[env(safe-area-inset-bottom)]">
      {NAV.map((n) => {
        const on = n.key === active;
        const disabled = n.key === "profile";
        return (
          <button
            key={n.key}
            onClick={() => n.key !== "profile" && go(n.key)}
            disabled={disabled}
            aria-current={on ? "page" : undefined}
            className={`${FELL_SC} ${FOCUS_RING} relative flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2 text-[13px] cursor-pointer disabled:opacity-40 ${on ? "text-[#f6e6b8]" : "text-[#cfb27a]/75"}`}
          >
            {on && <span className="absolute top-0 inset-x-3 h-[3px] bg-[linear-gradient(90deg,#8c6526,#ecd08a,#8c6526)]" />}
            <span className="relative">
              <DIcon name={n.icon} className={`w-6 h-6 ${on ? "text-[#e6c77e]" : ""}`} />
              {n.key === "party" && (
                <span className="absolute -top-1 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#5f9a86] text-[#0f1f1a] text-[11px] leading-4 font-['EB_Garamond',Georgia,serif] font-semibold text-center">{PARTY.members.length}</span>
              )}
            </span>
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
