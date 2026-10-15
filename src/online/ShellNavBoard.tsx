import type { Profile } from "./accountService";
import { CaptainSeal } from "./CaptainSeal";
import { ShellIcon } from "./ShellIcon";
import { SHELL_NAV, type NavKey } from "./shellNav";
import { playPath } from "./shellRoute";
import { NavActiveMark } from "./NavActiveMark";
import { BOARD_V, FOCUS_RING } from "./shellStyles";

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
        <span className="block font-fell text-[34px] leading-[0.95] italic text-shell-timber-text [text-shadow:0_2px_0_#120a04]">
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
                className={`${FOCUS_RING} relative flex w-full items-center gap-3 px-5 py-2.5 font-fell-sc text-[19px] ${
                  on
                    ? "bg-[linear-gradient(90deg,rgba(230,199,126,0.18),transparent)] text-[#f6e6b8]"
                    : "text-[#cfb27a]/80 hover:bg-white/[0.03] hover:text-shell-timber-text"
                }`}
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

function CaptainFooter({ captain }: { captain: Profile | null }) {
  const box = "flex items-center gap-3 border-t border-shell-tar/80 bg-black/20 px-4 py-4 font-garamond";
  if (!captain) {
    return (
      <div className={box}>
        <a href={playPath()} className={`${FOCUS_RING} text-[16px] text-shell-timber-text underline decoration-shell-brass underline-offset-2`}>
          Sign in to sail
        </a>
      </div>
    );
  }
  return (
    <div className={box}>
      <CaptainSeal id={captain.id} displayName={captain.displayName} avatarUrl={captain.avatarUrl} />
      <span className="min-w-0 truncate text-[16px] leading-tight text-shell-timber-text">{captain.displayName || "…"}</span>
    </div>
  );
}
