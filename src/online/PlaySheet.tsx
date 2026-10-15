import type { ReactNode } from "react";
import { PLAY_ACTIONS } from "./playActions";
import { ShellIcon } from "./ShellIcon";
import { BTN_INK, SECTION } from "./shellStyles";

interface PlaySheetProps {
  /** "Your voyages" (#301, `YourVoyages`): the match waiting on you with Take your turn, then your other voyages. */
  voyages: ReactNode;
  /** The player just left an online match, which is saved. */
  saved?: boolean;
}

/** The shell's Play sheet (#125), where a signed-in captain lands: their voyages lead, then the ways in. */
export function PlaySheet({ voyages, saved = false }: PlaySheetProps) {
  return (
    <div className="space-y-6">
      {saved && <p role="status">Your voyage is saved. Resume it below whenever you like.</p>}
      <div className="border-b-2 border-double border-[#7a5c3a]/50 pb-6">{voyages}</div>
      <section aria-labelledby="play-ways-in">
        <h2 id="play-ways-in" className={`${SECTION} mb-3`}>
          Set sail
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PLAY_ACTIONS.map((action) => (
            <li key={action.href}>
              <a href={action.href} className={`${BTN_INK} h-full w-full items-start! justify-start! gap-2.5! px-3! py-2.5! text-left`}>
                <ShellIcon name={action.icon} className="mt-0.5 h-5 w-5 shrink-0 text-[#6b4a20]" />
                <span>
                  <span className="block text-[16px] leading-tight">{action.title}</span>
                  <span className="block text-[14px] font-normal text-shell-ink-soft italic">{action.sub}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
