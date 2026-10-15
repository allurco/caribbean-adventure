import { comingPath } from "./shellRoute";
import { BOARD_H, FOCUS_RING } from "./shellStyles";

/**
 * The party board (#125): an empty slot until parties land (#119), which
 * fills it with the crew's seals and presence, an Invite button and the party
 * chat folded behind a button. Shared by the desktop dock (bottom left) and
 * the seal cluster's overlay on a phone held sideways.
 */
export function PartyBoard({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className={`${BOARD_H} p-3 font-garamond`}>
      <a
        href={comingPath("party")}
        onClick={onNavigate}
        className={`${FOCUS_RING} font-fell text-[22px] text-shell-timber-text hover:text-[#f6e6b8]`}
      >
        Party
      </a>
      <p className="mt-1 text-[15px] leading-snug text-shell-timber-soft italic">
        Sailing alone for now. Parties are coming: friends will gather here.
      </p>
    </div>
  );
}
