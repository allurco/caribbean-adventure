import { CaptainSeal } from "./CaptainSeal";
import { NavActiveMark } from "./NavActiveMark";
import { ShellIcon } from "./ShellIcon";
import { SHELL_NAV } from "./shellNav";
import type { NavProps } from "./ShellNavBoard";
import { BOARD_V, FOCUS_RING } from "./shellStyles";

/**
 * The nav board on a phone held sideways, or any short window (#125): the
 * desktop board stood on its end down the left edge, clear of the notch, an
 * icon over a short label on each tap target of at least 48 px.
 */
export function ShellSideNav({ active, captain }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className={`${BOARD_V} absolute top-3 bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-10 flex w-[76px] flex-col overflow-hidden`}
    >
      <ul className="flex min-h-0 flex-1 flex-col justify-evenly py-1">
        {SHELL_NAV.map((item) => {
          const on = item.key === active;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`${FOCUS_RING} relative flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 font-fell-sc text-[13px] leading-none ${
                  on ? "bg-[linear-gradient(90deg,rgba(230,199,126,0.2),transparent)] text-[#f6e6b8]" : "text-[#cfb27a]/80 active:text-shell-timber-text"
                }`}
              >
                {on && <NavActiveMark />}
                <ShellIcon name={item.icon} className={`h-6 w-6 ${on ? "text-shell-gold" : ""}`} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
      {captain && (
        <div className="flex justify-center border-t border-shell-tar/80 bg-black/20 py-2" title={captain.displayName}>
          <CaptainSeal id={captain.id} displayName={captain.displayName} avatarUrl={captain.avatarUrl} />
        </div>
      )}
    </nav>
  );
}
