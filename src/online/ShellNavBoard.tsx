import type { Profile } from "./accountService";
import { CaptainFooter } from "./CaptainFooter";
import { ShellIcon } from "./ShellIcon";
import { SHELL_NAV, type NavKey } from "./shellNav";
import { playPath } from "./shellRoute";
import { NavActiveMark } from "./NavActiveMark";
import { BOARD_V, FOCUS_RING, NAV_LIT, NAV_UNLIT } from "./shellStyles";

export interface NavProps {
  active: NavKey | null;
  /** The signed-in captain, or null when signed out (a public profile). Loading: a profile with an empty name. */
  captain: Profile | null;
}

/**
 * The shell's nav board on desktop (#125): a compact timber board floating at
 * the top left, only as tall as its items, with the harbour all round it:
 * the game's name, the five destinations, and the captain's seal and name.
 */
export function ShellNavBoard({ active, captain }: NavProps) {
  return (
    <nav aria-label="Main" className={`${BOARD_V} absolute top-6 left-6 z-10 flex w-56 flex-col overflow-hidden`}>
      <a href={playPath()} className={`${FOCUS_RING} block border-b border-shell-tar/80 px-5 pt-6 pb-5 shadow-[0_1px_0_rgba(255,220,160,0.06)]`}>
        <span className="block font-fell-sc text-[15px] leading-none text-shell-timber-soft">Project</span>
        <span className="block font-fell text-[34px] leading-[0.95] italic text-shell-timber-text [text-shadow:0_2px_0_var(--color-shell-char)]">
          Caribbean
        </span>
      </a>
      <ul className="py-3">
        {SHELL_NAV.map((item) => {
          const on = item.key === active;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`${FOCUS_RING} relative flex w-full items-center gap-3 px-5 py-2.5 font-fell-sc text-[19px] ${on ? NAV_LIT : NAV_UNLIT}`}
              >
                {on && <NavActiveMark />}
                <ShellIcon name={item.icon} className={`h-5 w-5 ${on ? "text-shell-gold" : ""}`} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
      <CaptainFooter captain={captain} />
    </nav>
  );
}
