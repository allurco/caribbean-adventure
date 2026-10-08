import { useState } from "react";
import { FRIENDS, ME, PARTY, PARTY_CHAT, PRESENCE_LABEL, type ChatLine } from "../../fixtures";
import { PresenceDot, Seal } from "../../primitives";
import { BTN_BRASS, BTN_INK, FELL, GARAMOND, INK_SOFT, RULE, SECTION, SLATE } from "../theme";

/** THROWAWAY PROTOTYPE: variant D, Party. The dock opened out: members and invites beside a chalk slate. */
export function DParty() {
  const [chat, setChat] = useState<ChatLine[]>([...PARTY_CHAT]);
  const [draft, setDraft] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  return (
    <div className={`${GARAMOND} grid lg:grid-cols-[280px_1fr] gap-6`}>
      <section>
        <h2 className={`${SECTION} mb-2 lining-nums`}>Members, {PARTY.members.length} of 6</h2>
        <ul className="space-y-3">
          {PARTY.members.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Seal player={p} size="md" />
              <div className="min-w-0">
                <div className={`${FELL} text-[19px] text-[#2b1d10] leading-tight`}>
                  {p.name}
                  {p.id === PARTY.leaderId && <span className={`ml-1.5 ${GARAMOND} text-[14px] italic text-[#8a6a33]`}>leader</span>}
                </div>
                <div className={`flex items-center gap-1.5 text-[14px] ${INK_SOFT} lining-nums`}>
                  <PresenceDot presence={p.presence} /> {PRESENCE_LABEL[p.presence]}, rating {p.rating}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <h2 className={`${SECTION} mt-6 mb-1`}>Invite a friend</h2>
        <ul>
          {FRIENDS.map((f) => {
            const sent = invited.includes(f.id);
            return (
              <li key={f.id} className={`flex items-center gap-2 py-2 border-t ${RULE} text-[16px] text-[#2b1d10]`}>
                <PresenceDot presence={f.presence} />
                <span className="flex-1">{f.name}</span>
                <button onClick={() => setInvited((x) => [...x, f.id])} disabled={sent || f.presence === "offline"} className={BTN_INK}>
                  {sent ? "Invited" : "Invite"}
                </button>
              </li>
            );
          })}
        </ul>
        <button className={`${BTN_INK} mt-4 !text-[#8a2617] !border-[#8a2617]/60 !shadow-[0_2px_0_rgba(138,38,23,0.6)]`}>Leave party</button>
      </section>

      <section className={`${SLATE} flex flex-col min-h-[340px] lg:min-h-[440px] p-4`}>
        <h2 className={`${FELL} italic text-[20px] text-[#d8d2c2] mb-2`}>Party chat</h2>
        <ul className="flex-1 overflow-y-auto space-y-3">
          {chat.map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <Seal player={PARTY.members.find((m) => m.name === c.from) ?? ME} size="sm" />
              <div>
                <div className="text-[14px] text-[#e6c77e]">
                  {c.from} <span className="text-[#a49a86]/70 lining-nums">{c.at}</span>
                </div>
                <div className="text-[16px] text-[#efe9dc]/90 leading-snug">{c.text}</div>
              </div>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setChat((c) => [...c, { from: ME.name, text: draft.slice(0, 500), at: "20:45" }]);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            aria-label="Message your party"
            placeholder="Message your party"
            className="flex-1 min-w-0 bg-black/30 border border-[#5b4a36]/70 rounded-[2px] px-3 py-2 text-[16px] text-[#efe7d4] placeholder:text-[#a49a86]/70 outline-none focus:border-[#e6c77e]/70"
          />
          <button className={BTN_BRASS}>Send</button>
        </form>
      </section>
    </div>
  );
}
