import { useState } from "react";
import { PARTY, PARTY_CHAT, PRESENCE_LABEL } from "../fixtures";
import { PresenceDot, Seal } from "../primitives";
import type { Screen } from "../shellKeys";
import { BTN_TIMBER, FELL, FOCUS_RING, GARAMOND, SLATE, TIMBER_H } from "./theme";

/**
 * THROWAWAY PROTOTYPE: variant D's party dock (tablet and up), a compact
 * board floating at the bottom left over the harbour: who is in the party
 * and where they are. The chat stays folded behind a button and opens as a
 * slate over the scene, not as a permanent column.
 */
export function DPartyDock({ go }: { go: (s: Screen) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <aside aria-label="Party" className={`${GARAMOND} hidden md:block absolute left-6 bottom-6 z-10 w-56`}>
      {open && (
        <div id="d-party-chat" className={`${SLATE} absolute bottom-full left-0 mb-3 w-80 flex flex-col p-2.5 rounded-[3px] shadow-[0_18px_40px_rgba(0,0,0,0.55)]`}>
          <div className="space-y-1.5 text-[15px] leading-snug max-h-56 overflow-y-auto">
            {PARTY_CHAT.map((c) => (
              <p key={c.at} className="text-[#e7e3d8]/90">
                <span className="text-[#e6c77e]">{c.from.split(" ")[0]}</span> {c.text}
              </p>
            ))}
          </div>
          <input autoFocus aria-label="Message your party" placeholder="Message your party" className="mt-2 bg-black/30 border border-[#5b4a36]/60 rounded-[2px] px-2 py-1 text-[15px] text-[#efe7d4] placeholder:text-[#a49a86]/70 outline-none focus:border-[#e6c77e]/70" />
        </div>
      )}
      <div style={TIMBER_H} className="p-3 rounded-[3px] border-2 border-[#1c120a] shadow-[inset_0_1px_0_rgba(255,220,160,0.12),0_12px_28px_rgba(0,0,0,0.5)]">
        <div className="flex items-baseline justify-between mb-2">
          <button onClick={() => go("party")} className={`${FELL} ${FOCUS_RING} text-[22px] text-[#f0dca6] cursor-pointer hover:text-[#f6e6b8]`}>
            Party <span className="text-[15px] italic text-[#c9a868]/80">{PARTY.members.length} of 6</span>
          </button>
          <button onClick={() => go("party")} className={BTN_TIMBER}>
            Invite
          </button>
        </div>
        <ul className="space-y-1.5">
          {PARTY.members.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="relative">
                <Seal player={p} size="sm" />
                <PresenceDot presence={p.presence} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-[#2a1a0e]" />
              </span>
              <span className="flex-1 min-w-0 text-[#f0dca6] text-[15px] leading-tight truncate">{p.name}</span>
              <span className="text-[#c9a868]/70 text-[13px] italic">{PRESENCE_LABEL[p.presence]}</span>
            </li>
          ))}
        </ul>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="d-party-chat" className={`${BTN_TIMBER} w-full mt-2.5 !justify-between`}>
          {open ? "Hide party chat" : "Party chat"}
          {!open && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#5f9a86] text-[#0f1f1a] text-[13px] leading-5 text-center">{PARTY_CHAT.length}</span>}
        </button>
      </div>
    </aside>
  );
}
