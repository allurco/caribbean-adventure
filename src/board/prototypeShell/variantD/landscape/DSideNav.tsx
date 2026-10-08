import { ME } from "../../fixtures";
import { Seal } from "../../primitives";
import type { VariantProps } from "../../shellKeys";
import { DIcon } from "../DIcon";
import { activeNav, NAV } from "../nav";
import { FELL_SC, FOCUS_RING, TIMBER_V } from "../theme";

/**
 * THROWAWAY PROTOTYPE: variant D's nav board on a phone held sideways. The
 * desktop board stood on its end: a slim vertical plank down the left edge,
 * clear of the notch, icon over a short label, the active one lit in brass.
 */
export function DSideNav({ screen, go }: VariantProps) {
  const active = activeNav(screen);
  return (
    <nav
      aria-label="Main"
      style={TIMBER_V}
      className="absolute z-10 top-3 bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] w-[76px] flex flex-col rounded-[3px] border-2 border-[#1c120a] shadow-[inset_0_1px_0_rgba(255,220,160,0.12),0_12px_28px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      <ul className="flex-1 min-h-0 flex flex-col justify-evenly py-1">
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
                className={`${FELL_SC} ${FOCUS_RING} relative w-full min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[13px] leading-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "text-[#f6e6b8] bg-[linear-gradient(90deg,rgba(230,199,126,0.2),transparent)]" : "text-[#cfb27a]/80 active:text-[#f0dca6]"
                }`}
              >
                {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[4px] bg-[linear-gradient(180deg,#ecd08a,#8c6526)] shadow-[0_0_8px_rgba(230,199,126,0.5)]" />}
                <DIcon name={n.icon} className={`w-6 h-6 ${on ? "text-[#e6c77e]" : ""}`} />
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-center py-2 border-t border-[#1c120a]/80 bg-black/20" title={ME.name}>
        <Seal player={ME} size="md" />
      </div>
    </nav>
  );
}
