import { PARTY } from "../fixtures";
import { Seal } from "../primitives";
import type { Screen } from "../shellKeys";
import { FOCUS_RING, GARAMOND, TIMBER_H } from "./theme";

/**
 * THROWAWAY PROTOTYPE: the party board folded to a chip of seals beside the
 * nameboard on phones. Opens the Party screen (also the Party tab).
 */
export function DCrewChip({ go }: { go: (s: Screen) => void }) {
  return (
    <button
      onClick={() => go("party")}
      style={TIMBER_H}
      aria-label={`Party of ${PARTY.members.length}, open party`}
      className={`${GARAMOND} ${FOCUS_RING} md:hidden flex items-center p-1 rounded-full border border-[#8a6a33]/70 shadow-[0_3px_0_#0d0703,0_6px_14px_rgba(0,0,0,0.4)] cursor-pointer active:translate-y-[2px]`}
    >
      <span className="flex -space-x-2">
        {PARTY.members.map((p) => (
          <Seal key={p.id} player={p} size="sm" />
        ))}
      </span>
    </button>
  );
}
