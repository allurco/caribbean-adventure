import { ME, PARTY, QUEUE, formatClock } from "../../fixtures";
import { Seal } from "../../primitives";
import { useCountUp } from "../../shellHooks";
import type { VariantProps } from "../../shellKeys";
import { BTN_INK, FELL, GARAMOND, INK_SOFT, PARCHMENT_INSET, RULE, SECTION } from "../theme";

const R = 74;
const C = 2 * Math.PI * R;

/** THROWAWAY PROTOTYPE: variant D, the ranked queue. A brass dial for the wait, six berths for who is found. */
export function DQueue({ go }: VariantProps) {
  const t = useCountUp(QUEUE.elapsed);
  const pct = Math.min(1, t / QUEUE.relaxAfter);
  const relaxIn = Math.max(0, QUEUE.relaxAfter - t);
  return (
    <div className={`${GARAMOND} grid lg:grid-cols-[300px_1fr] gap-6`}>
      <section className={`${PARCHMENT_INSET} p-5 flex flex-col items-center text-center`}>
        <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label={`Searching for ${formatClock(t)}`}>
          <circle cx="95" cy="95" r={R + 9} fill="none" stroke="#7a5c3a" strokeOpacity="0.45" strokeWidth="1" />
          <circle cx="95" cy="95" r={R} fill="none" stroke="#7a5c3a" strokeOpacity="0.25" strokeWidth="9" />
          <circle cx="95" cy="95" r={R} fill="none" stroke="#a87a32" strokeWidth="9" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 95 95)" />
          <text x="95" y="96" textAnchor="middle" fill="#2b1d10" fontSize="36" style={{ fontFamily: "'IM Fell English', Georgia, serif", fontVariantNumeric: "lining-nums tabular-nums" }}>
            {formatClock(t)}
          </text>
          <text x="95" y="120" textAnchor="middle" fill="#5c4630" fontSize="15" fontStyle="italic" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
            {QUEUE.found.length} of {QUEUE.target} found
          </text>
        </svg>
        <p className={`text-[15px] ${INK_SOFT} mt-2 max-w-[24ch] lining-nums`}>
          {relaxIn > 0 ? `If no one else comes, the match starts with ${QUEUE.minimum} captains in ${formatClock(relaxIn)}.` : `The match starts as soon as ${QUEUE.minimum} captains are found.`}
        </p>
        <button onClick={() => go("home")} className={`${BTN_INK} mt-4 !text-[#8a2617] !border-[#8a2617]/60 !shadow-[0_2px_0_rgba(138,38,23,0.6)]`}>
          Leave the queue
        </button>
      </section>
      <section>
        <h2 className={`${SECTION} mb-1 lining-nums`}>Captains found, rating near {ME.rating}</h2>
        <ul>
          {Array.from({ length: QUEUE.target }).map((_, i) => {
            const p = QUEUE.found[i];
            const party = p && PARTY.members.some((m) => m.id === p.id);
            return (
              <li key={i} className={`flex items-center gap-3 py-2.5 border-b ${RULE}`}>
                {p ? <Seal player={p} size="sm" /> : <span className="w-7 h-7 rounded-full border-2 border-dashed border-[#7a5c3a]/50 motion-safe:animate-pulse" />}
                <span className={`flex-1 ${p ? `${FELL} text-[18px] text-[#2b1d10]` : `italic text-[16px] ${INK_SOFT} opacity-70`}`}>{p ? p.name : "Searching"}</span>
                {party && <span className="text-[14px] italic text-[#3f7564]">your party</span>}
                {p && <span className={`text-[15px] ${INK_SOFT} lining-nums tabular-nums`}>{p.rating}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
