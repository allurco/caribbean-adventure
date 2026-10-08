import { MATCHES, ME, PARTY, PUBLIC_ROOMS } from "../../fixtures";
import type { Screen, VariantProps } from "../../shellKeys";
import { DIcon, type DIconName } from "../DIcon";
import { BTN_INK, BTN_WAX, FELL, GARAMOND, INK_SOFT, RULE, SECTION } from "../theme";

const ACTIONS: { title: string; sub: string; to: Screen; icon: DIconName }[] = [
  { title: "Create a room", sub: "Private, by invite link", to: "room", icon: "plus" },
  { title: "Browse the lobby", sub: `${PUBLIC_ROOMS.length} rooms open`, to: "lobby", icon: "board" },
  { title: "Your party", sub: `${PARTY.members.length} sailing together`, to: "party", icon: "crew" },
  { title: "Ranked queue", sub: `Rating ${ME.rating}`, to: "queue", icon: "crown" },
];

/** THROWAWAY PROTOTYPE: variant D, Play. The one match waiting on you leads; then ways in; then the ledger. */
export function DHome({ go }: VariantProps) {
  const mine = MATCHES.find((m) => m.yourTurn) ?? MATCHES[0];
  const others = MATCHES.filter((m) => m.id !== mine.id);
  return (
    <div className={GARAMOND}>
      <section className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 pb-6 border-b-2 border-double border-[#7a5c3a]/50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="shrink-0 w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center text-[#fbe9d0] bg-[radial-gradient(circle_at_35%_30%,#b23a24,#5a140a_85%)] shadow-[inset_0_-4px_8px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,200,170,0.35),0_3px_8px_rgba(60,10,0,0.4)] -rotate-6">
            <span className={`${FELL} text-[26px] leading-none lining-nums`}>{mine.hoursLeft}h</span>
            <span className="text-[11px] italic leading-none mt-0.5">left</span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] italic text-[#8a2617]">It is your turn</p>
            <h2 className={`${FELL} text-[26px] sm:text-[30px] leading-tight text-[#2b1d10]`}>{mine.name}</h2>
            <p className={`text-[15px] ${INK_SOFT} lining-nums`}>
              Round {mine.round} of a {mine.ranked ? "ranked" : "casual"} match, {mine.players} captains, {mine.mapSize.toLowerCase()} map. Glory {mine.glory} of 10.
            </p>
          </div>
        </div>
        <button className={`${BTN_WAX} w-full sm:w-auto`}>Take your turn</button>
      </section>

      <section className="grid grid-cols-2 gap-3 py-6">
        {ACTIONS.map((a) => (
          <button key={a.title} onClick={() => go(a.to)} className={`${BTN_INK} !justify-start !items-start !gap-2.5 !px-3 !py-2.5 text-left`}>
            <DIcon name={a.icon} className="w-5 h-5 mt-0.5 shrink-0 text-[#6b4a20]" />
            <span>
              <span className="block text-[16px] leading-tight">{a.title}</span>
              <span className={`block text-[14px] font-normal italic ${INK_SOFT} lining-nums`}>{a.sub}</span>
            </span>
          </button>
        ))}
      </section>

      <section>
        <h3 className={`${SECTION} mb-1`}>Your other voyages</h3>
        <ul>
          {others.map((m) => (
            <li key={m.id} className={`flex items-center gap-3 py-3 border-t ${RULE}`}>
              <div className="flex-1 min-w-0">
                <div className={`${FELL} text-[19px] text-[#2b1d10] truncate`}>{m.name}</div>
                <div className={`text-[14px] ${INK_SOFT} lining-nums`}>
                  Round {m.round}, {m.ranked ? "ranked" : "casual"}, glory {m.glory}. Waiting on {m.waitingOn}, {m.hoursLeft} h left.
                </div>
              </div>
              <button className={BTN_INK}>Open</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
