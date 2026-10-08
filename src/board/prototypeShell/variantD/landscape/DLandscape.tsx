import type { ReactNode } from "react";
import type { VariantProps } from "../../shellKeys";
import { TITLES } from "../nav";
import { PARCHMENT } from "../theme";
import { DSealCluster } from "./DSealCluster";
import { DShortSign } from "./DShortSign";
import { DSideNav } from "./DSideNav";

/**
 * THROWAWAY PROTOTYPE: variant D on a phone held sideways (the only way a
 * phone sees it now; portrait gets the rotate gate). Same pieces as desktop,
 * rearranged for 375-430 px of height:
 *
 *   | nav |  [short sign]                   (seals) |
 *   | nav |  +-----------------------------------+  |
 *   | nav |  | parchment sheet, scrolls itself   |  |
 *   | nav |  +-----------------------------------+  |
 *
 * 12 px gutters, widened to the safe-area inset on the notch side; the page
 * itself never scrolls. The harbour (rendered by VariantD) shows round it.
 */
export function DLandscape({ screen, go, children }: VariantProps & { children: ReactNode }) {
  const { title, meta } = TITLES[screen];
  const showParty = screen !== "party";
  return (
    <>
      <DSideNav screen={screen} go={go} />
      <div className="absolute top-0 bottom-[max(12px,env(safe-area-inset-bottom))] left-[calc(max(12px,env(safe-area-inset-left))+88px)] right-[max(12px,env(safe-area-inset-right))] flex flex-col">
        <header className={`shrink-0 h-[54px] flex items-end pl-3 ${showParty ? "pr-[164px]" : "pr-3"}`}>
          <DShortSign title={title} meta={meta} />
        </header>
        <main style={PARCHMENT} className="mx-auto mt-2.5 w-full max-w-[844px] flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[3px] px-5 py-4 sm:px-6 sm:py-5">
          {children}
        </main>
      </div>
      {showParty && <DSealCluster go={go} />}
    </>
  );
}
