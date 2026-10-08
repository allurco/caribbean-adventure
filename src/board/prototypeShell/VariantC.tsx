import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { FRIENDS, MATCHES, ME, ME_PROVIDER, ME_RANK_TITLE, ME_RECORD, PARTY, PARTY_CHAT, PRESENCE_LABEL, PUBLIC_ROOMS, QUEUE, ROOM, formatClock, type ChatLine } from "./fixtures";
import { PresenceDot, Seal } from "./primitives";
import { useCopy, useCountUp } from "./shellHooks";
import type { Screen, VariantProps } from "./shellKeys";

/**
 * THROWAWAY PROTOTYPE — Variant C, "Captain's logbook". One book on a dark
 * desk, nothing else. Each screen is a spread (one page on a phone) that
 * does one task; ribbon bookmarks are the only navigation. Matches read as
 * log entries, room settings as articles of agreement, seats as signatures.
 * Minimal chrome: the primary action is always the single line in red ink.
 */

const INK: CSSProperties = { fontFamily: "'IM Fell English', Georgia, 'Times New Roman', serif" };
const PAGE =
  "relative bg-[#efe3c4] text-[#2b1d0e] [background-image:radial-gradient(ellipse_at_50%_0%,rgba(255,252,235,0.6),transparent_55%),repeating-linear-gradient(0deg,transparent_0px,transparent_27px,rgba(80,110,140,0.18)_27px,rgba(80,110,140,0.18)_28px)]";
const RED = "text-[#8b1a10]";

const RIBBONS: { key: Screen; label: string; color: string }[] = [
  { key: "home", label: "Log", color: "#7f1d1d" },
  { key: "room", label: "Charter", color: "#1e3a5f" },
  { key: "lobby", label: "Notices", color: "#365314" },
  { key: "party", label: "Crew", color: "#713f12" },
  { key: "queue", label: "Fleet", color: "#4c1d95" },
];

function useFellFont() {
  useEffect(() => {
    const id = "proto-fell-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap";
    document.head.appendChild(link);
  }, []);
}

function InkAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`${RED} text-lg italic underline decoration-1 underline-offset-4 hover:decoration-2 cursor-pointer`} style={INK}>
      {children} →
    </button>
  );
}

function Heading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-2xl sm:text-3xl" style={INK}>
        {children}
      </div>
      {sub && <div className="text-sm italic opacity-70" style={INK}>{sub}</div>}
      <div className="mt-2 h-px bg-[#2b1d0e]/40" />
    </div>
  );
}

function Book({ screen, go, left, right }: VariantProps & { left: ReactNode; right: ReactNode }) {
  return (
    <div className="relative w-full max-w-[1040px] h-full max-h-[720px]">
      {/* Ribbons along the top edge */}
      <div className="absolute -top-0 left-6 sm:left-auto sm:right-10 z-10 flex gap-1.5">
        {RIBBONS.map((r) => (
          <button
            key={r.key}
            onClick={() => go(r.key)}
            className={`relative w-12 sm:w-14 pt-1 cursor-pointer transition-all ${screen === r.key ? "h-20" : "h-12 hover:h-14"}`}
            style={{ background: r.color, clipPath: "polygon(0 0,100% 0,100% 100%,50% 85%,0 100%)" }}
          >
            <span className="text-[10px] sm:text-[11px] text-amber-50/90 tracking-wide" style={INK}>
              {r.label}
            </span>
          </button>
        ))}
      </div>
      {/* Leather boards */}
      <div className="absolute inset-0 rounded-md bg-[#3a1d10] shadow-[0_30px_60px_rgba(0,0,0,0.7)]" />
      <div className="absolute inset-2 sm:inset-3 flex shadow-[0_0_0_1px_rgba(0,0,0,0.3)]">
        <div className={`${PAGE} hidden md:block flex-1 overflow-y-auto px-10 pt-16 pb-10 shadow-[inset_-30px_0_40px_-20px_rgba(60,30,10,0.35)]`}>{left}</div>
        <div className="hidden md:block w-px bg-[#2b1d0e]/30" />
        <div className={`${PAGE} flex-1 overflow-y-auto px-5 sm:px-10 pt-20 pb-24 md:pb-10 shadow-[inset_30px_0_40px_-20px_rgba(60,30,10,0.35)]`}>
          {/* On a phone the left page folds in above the right one */}
          <div className="md:hidden mb-6">{left}</div>
          {right}
        </div>
      </div>
    </div>
  );
}

function SignIn({ go }: VariantProps) {
  return (
    <div className="relative w-full max-w-[460px] h-full max-h-[680px] rounded-md bg-[#3a1d10] shadow-[0_30px_60px_rgba(0,0,0,0.7)] [background-image:radial-gradient(ellipse_at_40%_30%,rgba(140,70,30,0.35),transparent_60%)] flex flex-col items-center justify-center px-8 text-center">
      <div className="absolute inset-4 border-2 border-[#c9a45c]/40 rounded-sm pointer-events-none" />
      <div className="text-[#d9b56a] text-xs tracking-[0.4em] uppercase font-heading">The log of</div>
      <div className="text-[#e8c77a] text-4xl sm:text-5xl mt-2 font-heading tracking-wider leading-tight">Caribbean Merchant</div>
      <div className="w-16 h-px bg-[#c9a45c]/60 my-6" />
      {/* the bookplate */}
      <div className={`${PAGE} w-full max-w-xs px-6 py-5 text-left`}>
        <div className="text-lg mb-3" style={INK}>
          This book belongs to…
        </div>
        <div className="space-y-2">
          <button onClick={() => go("home")} className="w-full text-left italic border-b border-[#2b1d0e]/40 py-1.5 hover:bg-[#2b1d0e]/5 cursor-pointer" style={INK}>
            ✒ my Discord name
          </button>
          <button onClick={() => go("home")} className="w-full text-left italic border-b border-[#2b1d0e]/40 py-1.5 hover:bg-[#2b1d0e]/5 cursor-pointer" style={INK}>
            ✒ my Google account
          </button>
          <div className="flex items-end gap-2 pt-1">
            <input placeholder="or an email address" className="flex-1 min-w-0 bg-transparent border-b border-[#2b1d0e]/40 py-1.5 italic outline-none placeholder:text-[#2b1d0e]/50" style={INK} />
            <button className={`${RED} italic text-sm cursor-pointer`} style={INK}>
              send link
            </button>
          </div>
        </div>
        <div className="text-[11px] mt-3 opacity-60 italic" style={INK}>
          Thirteen years or older to keep a log.
        </div>
      </div>
    </div>
  );
}

function Home({ screen, go }: VariantProps) {
  const left = (
    <>
      <div className="flex flex-col items-center text-center">
        <Seal player={ME} size="xl" />
        <div className="text-3xl mt-3" style={INK}>
          {ME.name}
        </div>
        <div className="italic opacity-70" style={INK}>
          {ME_RANK_TITLE}, rated {ME.rating}
        </div>
        <div className="text-sm mt-4 opacity-80" style={INK}>
          {ME_RECORD.played} voyages, {ME_RECORD.wins} won · signed with {ME_PROVIDER}
        </div>
        <div className="text-sm mt-1 opacity-80" style={INK}>
          Sailing with {PARTY.members.filter((m) => m.id !== ME.id).map((m) => m.name.split(" ")[0]).join(" and ")}
        </div>
      </div>
      <div className="hidden md:block mt-10 space-y-2 text-base" style={INK}>
        <div className="italic opacity-60 text-sm">Other business</div>
        <div><button onClick={() => go("room")} className="hover:underline cursor-pointer">Draw up a charter</button></div>
        <div><button onClick={() => go("lobby")} className="hover:underline cursor-pointer">Read the harbour notices ({PUBLIC_ROOMS.length})</button></div>
        <div><button onClick={() => go("queue")} className="hover:underline cursor-pointer">Join the ranked fleet</button></div>
      </div>
    </>
  );
  const right = (
    <>
      <Heading sub="Voyages under way">Log</Heading>
      <div className="space-y-6">
        {MATCHES.map((m) => (
          <div key={m.id} style={INK}>
            <div className="flex items-baseline gap-3">
              <span className="text-sm opacity-60 w-16 shrink-0">Round {m.round}</span>
              <span className="text-xl">{m.name}</span>
            </div>
            <div className="pl-[76px] text-base leading-relaxed">
              {m.yourTurn ? (
                <>
                  <span className={RED}>Your watch.</span> {m.hoursLeft} hours remain on the glass. {m.players} captains, {m.mapSize.toLowerCase()} waters, glory {m.glory} of 10.
                  <div className="mt-1">
                    <InkAction>Take the helm</InkAction>
                  </div>
                </>
              ) : (
                <span className="opacity-75">
                  {m.waitingOn} has the watch; {m.hoursLeft} hours on the glass. {m.ranked ? "Ranked." : "Casual."} Glory {m.glory}.
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="md:hidden mt-8 space-y-1.5 text-base" style={INK}>
        <div className="italic opacity-60 text-sm">Other business</div>
        <div><button onClick={() => go("room")} className="underline cursor-pointer">Draw up a charter</button></div>
        <div><button onClick={() => go("lobby")} className="underline cursor-pointer">Read the harbour notices</button></div>
        <div><button onClick={() => go("queue")} className="underline cursor-pointer">Join the ranked fleet</button></div>
      </div>
    </>
  );
  return <Book screen={screen} go={go} left={left} right={right} />;
}

function Blank({ value, options, onPick }: { value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <button
      onClick={() => onPick(options[(options.indexOf(value) + 1) % options.length])}
      className={`${RED} italic border-b border-dashed border-[#8b1a10]/60 px-1 cursor-pointer hover:bg-[#8b1a10]/5`}
      title="Click to change"
    >
      {value}
    </button>
  );
}

function Room({ screen, go }: VariantProps) {
  const [s, setS] = useState(ROOM.settings);
  const [seats, setSeats] = useState(ROOM.seats);
  const { copied, copy } = useCopy();
  const left = (
    <div style={INK} className="text-lg leading-[28px]">
      <Heading sub={ROOM.name}>Articles of agreement</Heading>
      <p>
        I. This voyage shall carry <Blank value={String(s.seats)} options={["2", "3", "4", "5", "6"]} onPick={(v) => setS({ ...s, seats: Number(v) })} /> captains.
      </p>
      <p>
        II. It sails <Blank value={s.mapSize.toLowerCase()} options={["small", "medium", "large"]} onPick={(v) => setS({ ...s, mapSize: (v[0].toUpperCase() + v.slice(1)) as typeof s.mapSize })} /> waters, charted from seed <span className={`${RED} italic`}>{s.seed}</span>.
      </p>
      <p>
        III. Each watch lasts <Blank value={s.timer} options={["24 h async", "2 min live"]} onPick={(v) => setS({ ...s, timer: v as typeof s.timer })} />.
      </p>
      <p>
        IV. The voyage is <Blank value={s.ranked ? "ranked" : "casual"} options={["casual", "ranked"]} onPick={(v) => setS({ ...s, ranked: v === "ranked" })} /> and <Blank value={s.visibility.toLowerCase()} options={["private", "public"]} onPick={(v) => setS({ ...s, visibility: (v === "public" ? "Public" : "Private") })} />.
      </p>
      <p className="mt-4 text-base">
        Pass this to a friend: <span className="font-mono text-xs break-all">{ROOM.inviteLink}</span>{" "}
        <button onClick={() => copy(ROOM.inviteLink)} className={`${RED} italic underline cursor-pointer`}>
          {copied ? "copied" : "copy"}
        </button>
      </p>
    </div>
  );
  const right = (
    <div style={INK}>
      <Heading sub="Signed by those who sail">Signatures</Heading>
      <div className="space-y-3">
        {seats.slice(0, s.seats).map((seat, i) => (
          <div key={i} className="flex items-end gap-3 border-b border-[#2b1d0e]/50 pb-1 min-h-[40px]">
            {seat.kind === "filled" ? (
              <>
                <span className="text-2xl italic flex-1" style={{ fontFamily: "'IM Fell English', cursive" }}>
                  {seat.player.name}
                </span>
                <span className="text-xs opacity-60 pb-1">
                  {seat.host ? "master" : seat.party ? "crew" : ""} {seat.player.rating}
                </span>
                <button
                  onClick={() => setSeats((x) => x.map((y, j) => (j === i && y.kind === "filled" ? { ...y, ready: !y.ready } : y)))}
                  className={`text-sm italic pb-1 cursor-pointer ${seat.ready ? "" : "opacity-50"}`}
                >
                  {seat.ready ? "✓ ready" : "not yet"}
                </button>
              </>
            ) : (
              <span className="italic opacity-40 flex-1">unsigned</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-8">
        <InkAction>Set sail with four</InkAction>
      </div>
    </div>
  );
  return <Book screen={screen} go={go} left={left} right={right} />;
}

function Lobby({ screen, go }: VariantProps) {
  const left = (
    <div style={INK}>
      <Heading sub="Copied from the harbour board">Notices</Heading>
      <p className="italic opacity-75 text-lg leading-[28px]">
        Public charters wanting captains. Each line is one voyage; sign the one that suits you, or draw up your own.
      </p>
      <div className="mt-6">
        <InkAction onClick={() => go("room")}>Draw up a charter</InkAction>
      </div>
    </div>
  );
  const right = (
    <div style={INK}>
      <div className="grid grid-cols-[1fr_auto] text-xs uppercase tracking-widest opacity-60 border-b border-[#2b1d0e]/50 pb-1 mb-1">
        <span>Voyage</span>
        <span>Berths</span>
      </div>
      {PUBLIC_ROOMS.map((r) => (
        <div key={r.id} className="py-2 border-b border-[#2b1d0e]/20">
          <div className="flex items-baseline gap-3">
            <span className="text-xl flex-1">{r.name}</span>
            <span className="tabular-nums">
              {r.filled}/{r.seats}
            </span>
          </div>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="opacity-70 flex-1 italic">
              {r.host} ({r.hostRating}), {r.mapSize.toLowerCase()} waters, {r.timer}
            </span>
            <button onClick={() => go("room")} className={`${RED} italic underline cursor-pointer`}>
              sign on
            </button>
          </div>
        </div>
      ))}
    </div>
  );
  return <Book screen={screen} go={go} left={left} right={right} />;
}

function Party({ screen, go }: VariantProps) {
  const [chat, setChat] = useState<ChatLine[]>([...PARTY_CHAT]);
  const [draft, setDraft] = useState("");
  const left = (
    <div style={INK}>
      <Heading sub="Who sails with you">Crew</Heading>
      {PARTY.members.map((p) => (
        <div key={p.id} className="flex items-center gap-3 py-2">
          <Seal player={p} size="md" />
          <div className="flex-1">
            <div className="text-xl">
              {p.name} {p.id === PARTY.leaderId && <span className={`${RED} text-sm italic`}>captain</span>}
            </div>
            <div className="text-sm italic opacity-70 flex items-center gap-1.5">
              <PresenceDot presence={p.presence} /> {PRESENCE_LABEL[p.presence]}, rated {p.rating}
            </div>
          </div>
        </div>
      ))}
      <div className="mt-6 text-sm italic opacity-60">Send word to</div>
      {FRIENDS.map((f) => (
        <div key={f.id} className="flex items-center gap-2 py-0.5">
          <PresenceDot presence={f.presence} />
          <span className="flex-1">{f.name}</span>
          <button className={`${RED} italic text-sm underline cursor-pointer`}>invite</button>
        </div>
      ))}
    </div>
  );
  const right = (
    <div style={INK} className="flex flex-col h-full">
      <Heading sub="Words passed between the crew">Crew's log</Heading>
      <div className="flex-1 space-y-2 text-lg leading-[28px]">
        {chat.map((c, i) => (
          <p key={i}>
            <span className="text-sm opacity-60">{c.at}</span> <span className="italic">{c.from.split(" ")[0]}:</span> {c.text}
          </p>
        ))}
      </div>
      <form
        className="flex items-end gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) setChat((c) => [...c, { from: ME.name, text: draft.slice(0, 500), at: "20:45" }]);
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Write a line…" className="flex-1 min-w-0 bg-transparent border-b border-[#2b1d0e]/50 py-1 text-lg italic outline-none placeholder:text-[#2b1d0e]/40" style={INK} />
        <button className={`${RED} italic cursor-pointer`}>enter</button>
      </form>
    </div>
  );
  return <Book screen={screen} go={go} left={left} right={right} />;
}

function Tally({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-1.5 items-end h-10">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="w-[3px] h-10 bg-[#2b1d0e] rounded-full" style={{ transform: `rotate(${[-4, 3, -2, 5, -3, 2][i]}deg)` }} />
      ))}
    </span>
  );
}

function Queue({ screen, go }: VariantProps) {
  const t = useCountUp(QUEUE.elapsed);
  const left = (
    <div style={INK} className="flex flex-col items-center text-center">
      <Heading sub="Ranked, by the OpenSkill reckoning">Awaiting the fleet</Heading>
      <div className="text-6xl tabular-nums mt-4">{formatClock(t)}</div>
      <div className="italic opacity-70 mt-1">on the glass</div>
      <div className="mt-8">
        <Tally n={QUEUE.found.length} />
        <span className="inline-flex gap-1.5 items-end h-10 ml-1.5 opacity-25">
          <Tally n={QUEUE.target - QUEUE.found.length} />
        </span>
      </div>
      <div className="mt-2 text-lg">
        {QUEUE.found.length} of {QUEUE.target} sails sighted
      </div>
      <div className="italic opacity-70 text-sm mt-1 max-w-xs">
        Should none come by {formatClock(QUEUE.relaxAfter)}, the fleet sails with {QUEUE.minimum}.
      </div>
    </div>
  );
  const right = (
    <div style={INK}>
      <Heading sub="Entered as they are sighted">Sightings</Heading>
      {QUEUE.found.map((p, i) => (
        <p key={p.id} className="text-lg leading-[28px]">
          <span className="text-sm opacity-60">{formatClock(Math.round((i * QUEUE.elapsed) / QUEUE.found.length))}</span> {p.name}, rated {p.rating}
          {PARTY.members.some((m) => m.id === p.id) && <span className="italic opacity-70">, of our crew</span>}.
        </p>
      ))}
      <p className="text-lg leading-[28px] italic opacity-40">…</p>
      <div className="mt-8">
        <InkAction onClick={() => go("home")}>Strike the search</InkAction>
      </div>
    </div>
  );
  return <Book screen={screen} go={go} left={left} right={right} />;
}

const SCREENS: Record<Screen, (p: VariantProps) => ReactNode> = { signin: SignIn, home: Home, room: Room, lobby: Lobby, party: Party, queue: Queue };

export function VariantC({ screen, go }: VariantProps) {
  useFellFont();
  const Body = SCREENS[screen];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-10 pb-20 sm:pb-24 bg-[#1a0f08] [background-image:radial-gradient(ellipse_at_50%_35%,rgba(255,180,90,0.22),transparent_60%),repeating-linear-gradient(90deg,rgba(0,0,0,0.12)_0px,rgba(0,0,0,0.12)_3px,transparent_3px,transparent_90px)]">
      <Body screen={screen} go={go} />
    </div>
  );
}
