import { useState, type ReactNode } from "react";
import { HarbourBackdrop } from "./HarbourBackdrop";
import { FRIENDS, MATCHES, ME, ME_RANK_TITLE, PARTY, PARTY_CHAT, PRESENCE_LABEL, PUBLIC_ROOMS, QUEUE, ROOM, formatClock, type ChatLine } from "./fixtures";
import { PresenceDot, Seal } from "./primitives";
import { useCopy, useCountUp } from "./shellHooks";
import type { Screen, VariantProps } from "./shellKeys";

/**
 * THROWAWAY PROTOTYPE — Variant A, "Harbour backdrop". The live harbour
 * (the game's own sea, island and port) fills the screen and never leaves;
 * every screen is a diegetic object set at its edges: a nameboard, a tavern
 * notice board, a ship's manifest, a slate, a horizon of berths. The scene
 * is the hierarchy's top; the panels are props in it.
 */

const PARCHMENT =
  "bg-[#e9dcb8] text-stone-900 shadow-[0_10px_30px_rgba(0,0,0,0.55),inset_0_0_40px_rgba(120,80,30,0.35)] [background-image:radial-gradient(ellipse_at_30%_20%,rgba(255,250,230,0.5),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(110,70,20,0.25),transparent_55%)]";
const TIMBER =
  "bg-[#3b2414] border-[6px] border-[#2a170b] shadow-[0_14px_40px_rgba(0,0,0,0.6)] [background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0.18)_0px,rgba(0,0,0,0.18)_2px,transparent_2px,transparent_46px),linear-gradient(90deg,rgba(255,220,160,0.06),rgba(0,0,0,0.15))]";

function Nail({ className = "" }: { className?: string }) {
  return <span className={`absolute w-2.5 h-2.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#a8a29e,#1c1917)] shadow ${className}`} />;
}

function Note({ children, tilt = 0, className = "" }: { children: ReactNode; tilt?: number; className?: string }) {
  return (
    <div className={`relative ${PARCHMENT} px-4 pt-5 pb-3 ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <Nail className="top-1.5 left-1/2 -translate-x-1/2" />
      {children}
    </div>
  );
}

function Signboard({ title, sub, onClick, accent = false }: { title: string; sub: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} className="group relative pt-5 cursor-pointer text-left">
      {/* the rope it hangs from */}
      <span className="absolute top-0 left-6 h-5 w-px bg-amber-200/50" />
      <span className="absolute top-0 right-6 h-5 w-px bg-amber-200/50" />
      <div className={`${TIMBER} !border-4 px-4 py-3 transition-transform group-hover:-translate-y-0.5 ${accent ? "ring-2 ring-amber-400/70" : ""}`}>
        <div className="font-heading text-amber-100 text-sm sm:text-base tracking-wide">{title}</div>
        <div className="text-amber-300/60 text-[11px]">{sub}</div>
      </div>
    </button>
  );
}

function Nameboard({ go }: { go: (s: Screen) => void }) {
  return (
    <button onClick={() => go("home")} className={`absolute top-3 left-3 sm:top-5 sm:left-5 ${TIMBER} !border-4 flex items-center gap-3 pl-2 pr-4 py-2 cursor-pointer`}>
      <Seal player={ME} size="md" />
      <div className="text-left">
        <div className="font-heading text-amber-100 text-sm leading-tight">{ME.name}</div>
        <div className="text-amber-300/70 text-[11px] tabular-nums">
          {ME_RANK_TITLE} · {ME.rating} · <span className="text-emerald-300/80">party of {PARTY.members.length}</span>
        </div>
      </div>
    </button>
  );
}

function SignIn({ go }: VariantProps) {
  const [email, setEmail] = useState("");
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end sm:justify-center p-4 pb-28 sm:pb-4">
      <h1 className="font-heading text-4xl sm:text-6xl text-amber-50 tracking-[0.12em] drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)] mb-2 text-center">Caribbean Merchant</h1>
      <p className="text-amber-100/80 italic mb-6 drop-shadow text-center">The harbourmaster keeps the register. Sign it to sail.</p>
      <div className={`relative ${PARCHMENT} w-full max-w-md px-8 pt-8 pb-14 rotate-[-0.6deg]`}>
        <div className="font-heading text-xs uppercase tracking-[0.3em] text-stone-700 text-center mb-1">Letter of marque</div>
        <div className="text-center text-sm text-stone-700 mb-5">Present your colours</div>
        <div className="space-y-2">
          <button onClick={() => go("home")} className="w-full py-2.5 rounded bg-[#4f46a5] hover:bg-[#5b52bd] text-white text-sm font-semibold cursor-pointer shadow">Sign with Discord</button>
          <button onClick={() => go("home")} className="w-full py-2.5 rounded bg-stone-50 hover:bg-white text-stone-800 text-sm font-semibold cursor-pointer shadow border border-stone-300">Sign with Google</button>
        </div>
        <div className="flex items-center gap-2 my-4 text-[11px] text-stone-500 uppercase tracking-widest">
          <span className="h-px flex-1 bg-stone-400/60" />or by courier<span className="h-px flex-1 bg-stone-400/60" />
        </div>
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@port.example" className="flex-1 min-w-0 bg-transparent border-b-2 border-stone-500/60 px-1 py-1.5 text-sm outline-none placeholder:text-stone-500" />
          <button className="px-3 py-1.5 rounded bg-stone-800 text-amber-100 text-xs font-semibold uppercase tracking-wider cursor-pointer">Send link</button>
        </div>
        <div className="mt-3 text-[11px] text-stone-600">A magic link arrives by email. Sailors must be 13 or older.</div>
        {/* wax seal */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,#b91c1c,#450a0a)] shadow-lg flex items-center justify-center font-heading text-red-100/80">PC</div>
      </div>
    </div>
  );
}

function Home({ go }: VariantProps) {
  return (
    <>
      <Nameboard go={go} />
      {/* The harbour notice board: your voyages */}
      <div className={`absolute ${TIMBER} right-3 left-3 top-24 bottom-[262px] overflow-y-auto sm:overflow-visible sm:left-auto sm:bottom-auto sm:right-6 sm:top-6 sm:w-[380px] p-4 pt-3`}>
        <div className="font-heading text-amber-200/90 text-center tracking-[0.25em] uppercase text-xs mb-3">Your voyages</div>
        <div className="space-y-4">
          {MATCHES.map((m, i) => (
            <Note key={m.id} tilt={[-1.2, 0.8, -0.4][i]} className={m.yourTurn ? "" : "opacity-90 scale-[0.97]"}>
              {m.yourTurn && <span className="absolute -top-2 -right-2 rotate-6 bg-red-800 text-red-50 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 shadow">Your watch</span>}
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-heading font-bold text-sm">{m.name}</div>
                <div className="text-[11px] text-stone-600 shrink-0">Round {m.round}</div>
              </div>
              <div className="text-xs text-stone-700 mt-0.5">
                {m.yourTurn ? <b className="text-red-900">{m.hoursLeft} h of sand left in your glass</b> : <>Waiting on {m.waitingOn} · {m.hoursLeft} h left</>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-[11px] text-stone-600">
                  {m.players} captains · {m.mapSize} · {m.ranked ? "Ranked" : "Casual"} · Glory {m.glory}/10
                </div>
                {m.yourTurn && <button className="ml-2 shrink-0 px-3 py-1 bg-red-900 text-red-50 text-[11px] font-bold uppercase tracking-wider cursor-pointer shadow">Return to sea</button>}
              </div>
            </Note>
          ))}
        </div>
      </div>
      {/* Hanging signboards along the quay */}
      <div className="absolute left-3 right-3 bottom-24 sm:left-6 sm:right-auto grid grid-cols-2 sm:flex gap-x-2 gap-y-0 sm:gap-4">
        <Signboard title="Charter a ship" sub="Private room" onClick={() => go("room")} />
        <Signboard title="Notice board" sub={`${PUBLIC_ROOMS.length} open charters`} onClick={() => go("lobby")} />
        <Signboard title="Your crew" sub={`${PARTY.members.length} sailing together`} onClick={() => go("party")} />
        <Signboard title="Join the fleet" sub="Ranked queue" onClick={() => go("queue")} accent />
      </div>
    </>
  );
}

function Room({ go }: VariantProps) {
  const [seats, setSeats] = useState(ROOM.seats);
  const [settings, setSettings] = useState(ROOM.settings);
  const { copied, copy } = useCopy();
  const toggleReady = (i: number) =>
    setSeats((s) => s.map((seat, j) => (j === i && seat.kind === "filled" ? { ...seat, ready: !seat.ready } : seat)));
  const visible = seats.slice(0, settings.seats);
  return (
    <>
      <Nameboard go={go} />
      {/* Ship's manifest */}
      <div className={`absolute ${PARCHMENT} left-3 right-3 top-20 sm:right-auto sm:left-6 sm:top-24 sm:w-[400px] px-6 py-5`}>
        <div className="font-heading text-center text-lg tracking-wide">Manifest</div>
        <div className="text-center text-xs text-stone-600 mb-3 italic">{ROOM.name} · {settings.seats} berths</div>
        <ol className="space-y-2">
          {visible.map((seat, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-stone-500/40 pb-1.5">
              <span className="font-heading text-stone-500 w-5 text-right">{["I", "II", "III", "IV", "V", "VI"][i]}</span>
              {seat.kind === "filled" ? (
                <>
                  <Seal player={seat.player} size="sm" />
                  <span className="flex-1 italic font-semibold text-stone-800" style={{ fontFamily: "Georgia, serif" }}>
                    {seat.player.name}
                  </span>
                  {seat.host && <span className="text-[10px] uppercase tracking-wider text-amber-900">master</span>}
                  {seat.party && <span className="text-[10px] uppercase tracking-wider text-emerald-900">crew</span>}
                  <button onClick={() => toggleReady(i)} className={`text-[10px] px-1.5 py-0.5 uppercase tracking-wider cursor-pointer border ${seat.ready ? "border-emerald-800 text-emerald-900" : "border-stone-500 text-stone-500"}`}>
                    {seat.ready ? "Aboard" : "Ashore"}
                  </button>
                </>
              ) : (
                <span className="flex-1 text-stone-500 text-sm">________________ <span className="text-[11px] italic">berth unsigned</span></span>
              )}
            </li>
          ))}
        </ol>
        {/* invite slip */}
        <div className="mt-4 flex items-center gap-2 bg-stone-900/10 px-2 py-1.5">
          <span className="text-[11px] font-mono truncate flex-1">{ROOM.inviteLink}</span>
          <button onClick={() => copy(ROOM.inviteLink)} className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 bg-stone-800 text-amber-100 cursor-pointer">
            {copied ? "Copied" : "Copy invite"}
          </button>
        </div>
      </div>
      {/* Articles of the voyage, on a timber board */}
      <div className={`absolute ${TIMBER} left-3 right-3 bottom-24 sm:left-auto sm:right-6 sm:top-24 sm:bottom-auto sm:w-[340px] p-4 text-amber-100`}>
        <div className="font-heading text-amber-200/90 tracking-[0.25em] uppercase text-xs mb-3 text-center">Articles</div>
        <TimberRow label="Berths" options={["2", "3", "4", "5", "6"]} value={String(settings.seats)} onPick={(v) => setSettings({ ...settings, seats: Number(v) })} />
        <TimberRow label="Waters" options={["Small", "Medium", "Large"]} value={settings.mapSize} onPick={(v) => setSettings({ ...settings, mapSize: v as typeof settings.mapSize })} />
        <TimberRow label="Watch" options={["24 h async", "2 min live"]} value={settings.timer} onPick={(v) => setSettings({ ...settings, timer: v as typeof settings.timer })} />
        <TimberRow label="Stakes" options={["Casual", "Ranked"]} value={settings.ranked ? "Ranked" : "Casual"} onPick={(v) => setSettings({ ...settings, ranked: v === "Ranked" })} />
        <TimberRow label="Posting" options={["Private", "Public"]} value={settings.visibility} onPick={(v) => setSettings({ ...settings, visibility: v as typeof settings.visibility })} />
        <div className="flex items-center justify-between text-xs mt-2 text-amber-300/70">
          <span>Chart seed</span>
          <span className="font-mono text-amber-100">{settings.seed}</span>
        </div>
        <button className="mt-4 w-full py-3 font-heading text-base tracking-[0.2em] uppercase bg-amber-700 hover:bg-amber-600 text-amber-50 cursor-pointer shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]">
          Weigh anchor
        </button>
        <div className="text-center text-[11px] text-amber-300/60 mt-1">4 of {settings.seats} aboard · host starts</div>
      </div>
    </>
  );
}

function TimberRow({ label, options, value, onPick }: { label: string; options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-xs text-amber-300/70 w-16">{label}</span>
      <div className="flex flex-wrap justify-end gap-1">
        {options.map((o) => (
          <button key={o} onClick={() => onPick(o)} className={`text-[11px] px-2 py-0.5 cursor-pointer border ${o === value ? "bg-amber-200 text-stone-900 border-amber-200" : "border-amber-200/30 text-amber-100/80 hover:border-amber-200/60"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Lobby({ go }: VariantProps) {
  return (
    <>
      <Nameboard go={go} />
      <div className={`absolute ${TIMBER} left-3 right-3 top-20 bottom-24 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[900px] sm:top-24 sm:bottom-auto sm:max-h-[calc(100%-13rem)] p-5 overflow-y-auto`}>
        <div className="font-heading text-amber-200/90 text-center tracking-[0.3em] uppercase text-sm mb-4">Charters seeking crew</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {PUBLIC_ROOMS.map((r, i) => (
            <Note key={r.id} tilt={[-2, 1.5, -0.8, 2.2, -1.4][i]}>
              <div className="font-heading font-bold text-sm leading-tight">{r.name}</div>
              <div className="text-[11px] text-stone-600 mb-2">
                Master {r.host} ({r.hostRating})
              </div>
              <div className="text-xs text-stone-700">
                {r.mapSize} waters · {r.timer}
              </div>
              <div className="flex items-center gap-1 my-2">
                {Array.from({ length: r.seats }).map((_, k) => (
                  <span key={k} className={`w-3.5 h-3.5 rounded-full border border-stone-700 ${k < r.filled ? "bg-stone-800" : "bg-transparent"}`} />
                ))}
                <span className="text-[11px] text-stone-600 ml-1">{r.seats - r.filled} free</span>
              </div>
              <button onClick={() => go("room")} className="w-full py-1 bg-stone-800 text-amber-100 text-[11px] font-bold uppercase tracking-wider cursor-pointer">Sign on</button>
            </Note>
          ))}
          <Note tilt={1}>
            <div className="font-heading font-bold text-sm">Post your own</div>
            <div className="text-xs text-stone-600 my-2">Charter a ship and pin it here for strangers.</div>
            <button onClick={() => go("room")} className="w-full py-1 border border-stone-800 text-[11px] font-bold uppercase tracking-wider cursor-pointer">Charter a ship</button>
          </Note>
        </div>
      </div>
    </>
  );
}

function Party({ go }: VariantProps) {
  const [chat, setChat] = useState<ChatLine[]>([...PARTY_CHAT]);
  const [draft, setDraft] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  return (
    <>
      <Nameboard go={go} />
      {/* The crew at their tavern table */}
      <div className={`absolute ${TIMBER} left-3 right-3 top-20 sm:right-auto sm:left-6 sm:top-24 sm:w-[340px] p-4`}>
        <div className="font-heading text-amber-200/90 tracking-[0.25em] uppercase text-xs mb-3 text-center">Your crew</div>
        <div className="space-y-2">
          {PARTY.members.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Seal player={p} size="md" />
              <div className="flex-1">
                <div className="text-amber-100 text-sm font-semibold">
                  {p.name} {p.id === PARTY.leaderId && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-400">captain</span>}
                </div>
                <div className="text-[11px] text-amber-300/60 flex items-center gap-1.5">
                  <PresenceDot presence={p.presence} /> {PRESENCE_LABEL[p.presence]} · {p.rating}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-amber-200/10 mt-4 pt-3">
          <div className="text-[11px] uppercase tracking-wider text-amber-300/60 mb-2">Call to the table</div>
          {FRIENDS.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm text-amber-100/80 mb-1.5">
              <PresenceDot presence={f.presence} />
              <span className="flex-1">{f.name}</span>
              <button onClick={() => setInvited((x) => [...x, f.id])} disabled={invited.includes(f.id)} className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-amber-200/30 cursor-pointer disabled:opacity-50">
                {invited.includes(f.id) ? "Sent" : "Invite"}
              </button>
            </div>
          ))}
        </div>
      </div>
      {/* The tavern slate: party chat in chalk */}
      <div className="absolute left-3 right-3 bottom-24 h-[260px] sm:h-auto sm:left-auto sm:right-6 sm:top-24 sm:bottom-28 sm:w-[420px] flex flex-col bg-[#22272b] border-[10px] border-[#4a2e17] shadow-[0_14px_40px_rgba(0,0,0,0.6)] p-4">
        <div className="font-heading text-stone-300/80 tracking-[0.25em] uppercase text-xs mb-2 text-center">The slate</div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {chat.map((c, i) => (
            <div key={i} className="text-stone-100/90 text-sm" style={{ fontFamily: "'Comic Sans MS', 'Chalkboard', cursive" }}>
              <span className="text-amber-200/80">{c.from.split(" ")[0]}:</span> {c.text} <span className="text-stone-400/50 text-[10px]">{c.at}</span>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setChat((c) => [...c, { from: ME.name, text: draft.slice(0, 500), at: "20:45" }]);
            setDraft("");
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Chalk a message…" className="flex-1 min-w-0 bg-white/5 border border-stone-500/40 px-2 py-1 text-sm text-stone-100 outline-none" />
          <button className="px-3 text-xs uppercase tracking-wider bg-stone-300 text-stone-900 font-bold cursor-pointer">Write</button>
        </form>
      </div>
    </>
  );
}

function Queue({ go }: VariantProps) {
  const t = useCountUp(QUEUE.elapsed);
  const relaxIn = Math.max(0, QUEUE.relaxAfter - t);
  return (
    <>
      <Nameboard go={go} />
      <div className="absolute top-24 sm:top-16 left-1/2 -translate-x-1/2 text-center w-full px-4">
        <div className="font-heading text-amber-50 text-2xl sm:text-4xl tracking-[0.15em] drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)]">The fleet gathers</div>
        <div className="text-amber-100/90 drop-shadow mt-1 tabular-nums">
          Searching {formatClock(t)} · {QUEUE.found.length} of {QUEUE.target} sails sighted
        </div>
        <div className="text-amber-100/70 text-sm drop-shadow italic">
          {relaxIn > 0 ? `Sets sail with ${QUEUE.minimum} in ${formatClock(relaxIn)} if no more come` : `Will set sail with ${QUEUE.minimum} or more`}
        </div>
      </div>
      {/* the horizon: six berths along the quay */}
      <div className={`absolute ${TIMBER} left-3 right-3 bottom-24 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[860px] p-4`}>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {Array.from({ length: QUEUE.target }).map((_, i) => {
            const p = QUEUE.found[i];
            const party = p && PARTY.members.some((m) => m.id === p.id);
            return (
              <div key={i} className={`flex flex-col items-center gap-1.5 py-3 border ${p ? "border-amber-300/40 bg-black/20" : "border-dashed border-amber-200/20"}`}>
                {p ? <Seal player={p} size="lg" /> : <div className="w-16 h-16 rounded-full border-2 border-dashed border-amber-200/25 animate-pulse" />}
                <div className="text-[11px] text-amber-100 text-center leading-tight h-7">{p ? p.name : "…"}</div>
                <div className="text-[10px] uppercase tracking-wider text-amber-400/70 h-3">{p ? (party ? "your crew" : p.rating) : ""}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-amber-300/70">Your crew of {PARTY.members.length} queues together · Ranked · OpenSkill</div>
          <button onClick={() => go("home")} className="px-4 py-1.5 bg-red-900/80 hover:bg-red-800 text-red-50 text-xs font-bold uppercase tracking-wider cursor-pointer">
            Stand down
          </button>
        </div>
      </div>
    </>
  );
}

const SCREENS: Record<Screen, (p: VariantProps) => ReactNode> = { signin: SignIn, home: Home, room: Room, lobby: Lobby, party: Party, queue: Queue };

export function VariantA({ screen, go }: VariantProps) {
  const Body = SCREENS[screen];
  return (
    <div className="absolute inset-0">
      <HarbourBackdrop />
      {/* a soft vignette so the props read over bright water */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,10,20,0.55))]" />
      <div className="absolute inset-0">
        <Body screen={screen} go={go} />
      </div>
    </div>
  );
}
