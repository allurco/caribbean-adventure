import type { ReactNode } from "react";
import { usePhoneOrientation } from "../rotateGate/usePhoneOrientation";
import type { Screen, VariantProps } from "./shellKeys";
import { DCrewChip } from "./variantD/DCrewChip";
import { DNavRail } from "./variantD/DNavRail";
import { DPartyDock } from "./variantD/DPartyDock";
import { DTabBar } from "./variantD/DTabBar";
import { DWindowBand } from "./variantD/DWindowBand";
import { HarbourWindow } from "./variantD/HarbourWindow";
import { DLandscape } from "./variantD/landscape/DLandscape";
import { TITLES } from "./variantD/nav";
import { DHome } from "./variantD/screens/DHome";
import { DLobby } from "./variantD/screens/DLobby";
import { DParty } from "./variantD/screens/DParty";
import { DQueue } from "./variantD/screens/DQueue";
import { DRoom } from "./variantD/screens/DRoom";
import { DSignIn } from "./variantD/screens/DSignIn";
import { PARCHMENT } from "./variantD/theme";
import { usePeriodFonts } from "./variantD/usePeriodFonts";

/**
 * THROWAWAY PROTOTYPE — Variant D, "Harbour launcher": B's structure in A's
 * harbour. B's information architecture unchanged (persistent navigation,
 * one content pane, the party always in view, the same six screens and
 * fixtures), laid over the full harbour as separate floating pieces: a
 * compact nav board at the top left, a compact party board at the bottom
 * left (chat folded), both 224 px on the same 24 px edge, and the screen as
 * one parchment sheet (820 px at most) under a hanging nameboard, centred in
 * the space to their right and top-aligned with the nav board. Nothing runs
 * full height; the harbour shows round all of it. A touch phone held
 * sideways gets DLandscape (side nav, short sign, seal cluster); held
 * upright it gets the rotate gate (App). A narrow desktop window under
 * 768 px keeps the bottom tab bar and the party chip in the header.
 */

const BODIES: Record<Exclude<Screen, "signin">, (p: VariantProps) => ReactNode> = {
  home: DHome,
  room: DRoom,
  lobby: DLobby,
  party: DParty,
  queue: DQueue,
};

export function VariantD({ screen, go }: VariantProps) {
  usePeriodFonts();
  const landscape = usePhoneOrientation() === "landscape";
  if (screen === "signin") {
    return (
      <div className="absolute inset-0 bg-[#082633]">
        <HarbourWindow />
        <DSignIn screen={screen} go={go} />
      </div>
    );
  }
  const Body = BODIES[screen];
  if (landscape) {
    return (
      <div className="absolute inset-0 bg-[#082633]">
        <HarbourWindow />
        <DLandscape screen={screen} go={go}>
          <Body screen={screen} go={go} />
        </DLandscape>
      </div>
    );
  }
  const { title, meta } = TITLES[screen];
  const showDock = screen !== "party";
  return (
    <div className="absolute inset-0 bg-[#082633]">
      <HarbourWindow />
      <DNavRail screen={screen} go={go} />
      {/* the content column, centred in the space right of the boards: hanging nameboard over one parchment sheet */}
      <div className="absolute inset-y-0 left-0 right-0 md:left-[272px] md:right-6">
        <div className="mx-auto h-full w-full md:max-w-[844px] flex flex-col">
          <DWindowBand title={title} meta={meta} aside={showDock ? <DCrewChip go={go} /> : undefined} />
          {/* md:px-3 keeps the sheet's shadow inside the scroll box; the sheet itself is 820 px at most */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 md:px-3 pb-24 md:pb-6">
            <div style={PARCHMENT} className="rounded-[3px] px-4 py-5 sm:px-7 sm:py-7">
              <Body screen={screen} go={go} />
            </div>
          </main>
        </div>
      </div>
      {showDock && <DPartyDock go={go} />}
      <DTabBar screen={screen} go={go} />
    </div>
  );
}
