import type { ReactNode } from "react";
import type { Profile } from "./accountService";
import { Nameboard } from "./Nameboard";
import { NameboardShort } from "./NameboardShort";
import { PartyDock } from "./PartyDock";
import { SealCluster } from "./SealCluster";
import type { ShellLayout } from "./shellLayout";
import { activeNav, nameboardFor } from "./shellNav";
import { ShellNavBoard } from "./ShellNavBoard";
import type { ShellPage } from "./shellRoute";
import { ShellSideNav } from "./ShellSideNav";
import { SHEET } from "./shellStyles";

interface ShellFrameProps {
  layout: ShellLayout;
  page: ShellPage;
  /** The signed-in captain; null when signed out (a public profile). */
  captain: Profile | null;
  /** The sheet's content. */
  children: ReactNode;
}

/**
 * The shell's boards over the harbour (#125), laid over `HarbourBackdrop`:
 *
 * desktop: the nav board at the top left and the party board at the bottom
 * left (both 224 px on the same 24 px edge), and one parchment sheet (820 px
 * at most) under a hanging nameboard, centred in the space to their right
 * and top-aligned with the nav board. Nothing runs full height.
 *
 * compact (a phone held sideways):
 *
 *   | nav |  [one-line nameboard]          (seal) |
 *   | nav |  +--------------------------------+   |
 *   | nav |  | parchment sheet, scrolls itself |  |
 *   | nav |  +--------------------------------+   |
 *
 * 12 px gutters, widened to the safe-area inset on the notch side (the insets
 * read as 0 until #123 sets `viewport-fit=cover`); the page never scrolls.
 */
export function ShellFrame({ layout, page, captain, children }: ShellFrameProps) {
  const active = activeNav(page, captain?.id ?? null);
  const board = nameboardFor(page);
  // On the party screen the party board would only repeat it.
  const showParty = !(page.kind === "coming" && page.screen === "party");

  if (layout === "compact") {
    const clusterShown = showParty && captain !== null;
    return (
      <>
        <ShellSideNav active={active} captain={captain} />
        <div className="absolute top-0 right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] left-[calc(max(12px,env(safe-area-inset-left))+88px)] flex flex-col">
          <header className={`flex h-[54px] shrink-0 items-end pl-3 ${clusterShown ? "pr-[64px]" : "pr-3"}`}>
            <NameboardShort {...board} />
          </header>
          <main className={`${SHEET} mx-auto mt-2.5 min-h-0 w-full max-w-[844px] flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5`}>
            {children}
          </main>
        </div>
        {clusterShown && <SealCluster captain={captain} />}
      </>
    );
  }

  return (
    <>
      <ShellNavBoard active={active} captain={captain} />
      <div className="absolute inset-y-0 right-6 left-[272px]">
        <div className="mx-auto flex h-full w-full max-w-[844px] flex-col">
          <Nameboard {...board} />
          {/* px-3 keeps the sheet's shadow inside the scroll box; the sheet itself is 820 px at most */}
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-6">
            <div className={`${SHEET} px-7 py-7`}>{children}</div>
          </main>
        </div>
      </div>
      {showParty && <PartyDock />}
    </>
  );
}
