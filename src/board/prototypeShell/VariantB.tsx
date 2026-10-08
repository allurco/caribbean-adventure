import { useState, type ReactNode } from "react";
import { FRIENDS, MATCHES, ME, ME_PROVIDER, ME_RANK_TITLE, ME_RECORD, PARTY, PARTY_CHAT, PRESENCE_LABEL, PUBLIC_ROOMS, QUEUE, ROOM, formatClock, type ChatLine } from "./fixtures";
import { PresenceDot, Seal } from "./primitives";
import { useCopy, useCountUp } from "./shellHooks";
import type { Screen, VariantProps } from "./shellKeys";

/**
 * THROWAWAY PROTOTYPE — Variant B, "Classic launcher". A persistent frame
 * like a PC game launcher: a navigation rail on the left (Play, Lobby, Party,
 * Ranked, Profile), the content pane in the middle and the party dock always
 * on the right. Everything is one click away; the hierarchy is the
 * navigation. Panels use the in-game HUD's own stone-and-amber treatment.
 */

const PANEL = "rounded-xl border border-amber-700/30 bg-gradient-to-b from-stone-900/95 to-amber-950/80 shadow-lg shadow-black/40";
const LABEL = "text-[10px] uppercase tracking-[0.18em] text-amber-500/60 font-semibold";
const PRIMARY = "font-heading px-5 py-2 bg-amber-700/80 hover:bg-amber-600/90 border border-amber-500/50 text-amber-50 text-xs font-bold rounded-lg uppercase tracking-widest cursor-pointer transition-colors";
const SECONDARY = "px-3 py-1.5 bg-stone-800/80 hover:bg-stone-700/80 border border-amber-700/30 text-amber-200/90 text-[11px] font-semibold rounded-md uppercase tracking-wider cursor-pointer transition-colors";

const NAV: { key: Screen | "profile"; label: string; glyph: string }[] = [
  { key: "home", label: "Play", glyph: "⚓" },
  { key: "lobby", label: "Lobby", glyph: "☰" },
  { key: "party", label: "Party", glyph: "⚑" },
  { key: "queue", label: "Ranked", glyph: "♛" },
  { key: "profile", label: "Profile", glyph: "☉" },
];

function NavRail({ screen, go }: VariantProps) {
  const active = screen === "room" ? "home" : screen;
  return (
    <nav className="flex sm:flex-col sm:w-52 shrink-0 bg-black/40 border-b sm:border-b-0 sm:border-r border-amber-800/30">
      <div className="hidden sm:block px-5 py-5 font-heading text-amber-100 text-lg tracking-[0.15em] leading-tight">
        Caribbean
        <br />
        Merchant
      </div>
      <div className="flex sm:flex-col flex-1 sm:flex-none">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => n.key !== "profile" && go(n.key)}
            className={`flex-1 sm:flex-none flex flex-col sm:flex-row items-center gap-0.5 sm:gap-3 px-2 sm:px-5 py-2 sm:py-3 text-[10px] sm:text-sm font-semibold uppercase tracking-wider cursor-pointer border-b-2 sm:border-b-0 sm:border-l-2 ${
              n.key === active ? "border-amber-400 text-amber-100 bg-amber-900/30" : "border-transparent text-amber-300/50 hover:text-amber-200"
            } ${n.key === "profile" ? "opacity-50" : ""}`}
          >
            <span className="text-base sm:w-5 text-center">{n.glyph}</span>
            {n.label}
          </button>
        ))}
      </div>
      <div className="hidden sm:flex mt-auto items-center gap-3 px-4 py-4 border-t border-amber-800/30">
        <Seal player={ME} size="md" />
        <div className="min-w-0">
          <div className="text-amber-100 text-sm font-semibold truncate">{ME.name}</div>
          <div className="text-amber-400/70 text-[11px] tabular-nums">
            {ME_RANK_TITLE} · {ME.rating}
          </div>
        </div>
      </div>
    </nav>
  );
}

function PartyDock({ go, compact }: { go: (s: Screen) => void; compact?: boolean }) {
  if (compact) {
    return (
      <button onClick={() => go("party")} className="sm:hidden flex items-center gap-2 px-4 py-2 bg-black/30 border-b border-amber-800/30 cursor-pointer">
        <span className={LABEL}>Party</span>
        <div className="flex -space-x-2">
          {PARTY.members.map((p) => (
            <Seal key={p.id} player={p} size="sm" />
          ))}
        </div>
        <span className="text-amber-300/60 text-[11px] ml-auto">2 online · open chat</span>
      </button>
    );
  }
  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-black/30 border-l border-amber-800/30 p-4 gap-4">
      <div className="flex items-center justify-between">
        <span className={LABEL}>Party · {PARTY.members.length}/6</span>
        <button className={SECONDARY}>Invite</button>
      </div>
      <div className="space-y-2.5">
        {PARTY.members.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5">
            <div className="relative">
              <Seal player={p} size="sm" />
              <PresenceDot presence={p.presence} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-stone-950" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-amber-100 text-sm truncate">
                {p.name} {p.id === PARTY.leaderId && <span className="text-amber-400 text-[10px]">★</span>}
              </div>
              <div className="text-amber-400/50 text-[11px]">{PRESENCE_LABEL[p.presence]}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-black/30 border border-amber-800/20 p-2">
        <div className={`${LABEL} mb-1`}>Party chat</div>
        <div className="flex-1 overflow-y-auto space-y-1.5 text-[12px]">
          {PARTY_CHAT.map((c, i) => (
            <div key={i} className="text-amber-100/80">
              <span className="text-amber-400/80 font-semibold">{c.from.split(" ")[0]}</span> {c.text}
            </div>
          ))}
        </div>
        <input placeholder="Message party" className="mt-2 bg-stone-900/80 border border-amber-800/30 rounded px-2 py-1 text-xs text-amber-100 outline-none" />
      </div>
      <div className={`${LABEL}`}>Friends</div>
      <div className="space-y-1.5 -mt-2">
        {FRIENDS.map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-[12px] text-amber-200/70">
            <PresenceDot presence={f.presence} /> {f.name}
          </div>
        ))}
      </div>
    </aside>
  );
}

function TopBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <h1 className="font-heading text-xl sm:text-2xl text-amber-100 tracking-wide">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function SignIn({ go }: VariantProps) {
  return (
    <div className="absolute inset-0 flex flex-col sm:flex-row bg-stone-950">
      <div className="relative sm:flex-[3] h-56 sm:h-auto overflow-hidden bg-[linear-gradient(180deg,#f3d9a4_0%,#9fc8d6_38%,#1f6f8b_55%,#0c3b55_80%,#06202f_100%)]">
        <div className="absolute inset-x-0 top-[52%] h-px bg-white/40" />
        <div className="absolute left-[18%] top-[44%] w-40 h-10 bg-[#3f5d2e] rounded-t-[60%] opacity-80" />
        <div className="absolute left-[60%] top-[47%] w-24 h-6 bg-[#4b6b35] rounded-t-[60%] opacity-70" />
        <div className="absolute bottom-6 left-6 sm:bottom-12 sm:left-12">
          <div className="font-heading text-amber-50 text-3xl sm:text-6xl tracking-[0.1em] drop-shadow-lg">Caribbean Merchant</div>
          <div className="text-amber-50/90 mt-1 drop-shadow">Six captains. One sea. Play over days or in an evening.</div>
        </div>
      </div>
      <div className="sm:flex-[2] flex items-center justify-center p-6 bg-gradient-to-b from-stone-900 to-amber-950/60">
        <div className="w-full max-w-sm">
          <div className={LABEL}>Sign in</div>
          <h2 className="font-heading text-2xl text-amber-100 mb-6 mt-1">Welcome aboard</h2>
          <div className="space-y-2.5">
            <button onClick={() => go("home")} className="w-full py-2.5 rounded-lg bg-[#5865f2] hover:bg-[#6b76f5] text-white text-sm font-semibold cursor-pointer">Continue with Discord</button>
            <button onClick={() => go("home")} className="w-full py-2.5 rounded-lg bg-white hover:bg-stone-100 text-stone-800 text-sm font-semibold cursor-pointer">Continue with Google</button>
          </div>
          <div className="flex items-center gap-3 my-5 text-amber-500/40 text-[11px] uppercase tracking-widest">
            <span className="h-px flex-1 bg-amber-800/40" />or<span className="h-px flex-1 bg-amber-800/40" />
          </div>
          <label className={LABEL}>Email</label>
          <input placeholder="you@example.com" className="mt-1 w-full bg-stone-900/80 border border-amber-800/40 rounded-lg px-3 py-2 text-sm text-amber-100 outline-none focus:border-amber-500/60" />
          <button className={`${PRIMARY} w-full mt-3`}>Email me a magic link</button>
          <p className="text-amber-400/40 text-[11px] mt-4">By signing in you confirm you are 13 or older. Your profile shows only your display name and avatar.</p>
        </div>
      </div>
    </div>
  );
}

function Home({ go }: VariantProps) {
  const mine = MATCHES.find((m) => m.yourTurn)!;
  return (
    <>
      <TopBar title="Play">
        <span className="sm:hidden flex items-center gap-2 text-right">
          <span>
            <span className="block text-amber-100 text-sm font-semibold">{ME.name}</span>
            <span className="block text-amber-400/70 text-[11px]">
              {ME_RANK_TITLE} · {ME.rating}
            </span>
          </span>
          <Seal player={ME} size="md" />
        </span>
        <span className="hidden sm:inline text-amber-400/60 text-xs">
          {ME_RECORD.played} played · {ME_RECORD.wins} won · via {ME_PROVIDER}
        </span>
      </TopBar>
      {/* Hero: the one match that needs you */}
      <div className={`${PANEL} p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4 border-amber-500/50`}>
        <div className="flex-1">
          <div className="text-red-300 text-[10px] uppercase tracking-[0.2em] font-bold">Your turn · {mine.hoursLeft} h left</div>
          <div className="font-heading text-amber-100 text-xl mt-1">{mine.name}</div>
          <div className="text-amber-300/60 text-xs mt-1">
            Round {mine.round} · {mine.players} players · {mine.mapSize} · {mine.ranked ? "Ranked" : "Casual"} · Glory {mine.glory}/10
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-stone-800 overflow-hidden">
            <div className="h-full bg-red-500/80" style={{ width: `${(mine.hoursLeft / 24) * 100}%` }} />
          </div>
        </div>
        <button className={`${PRIMARY} !py-3 !px-8 !text-sm`}>Take your turn</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { t: "Create room", s: "Private, invite link", k: "room" as Screen },
          { t: "Browse lobby", s: `${PUBLIC_ROOMS.length} open rooms`, k: "lobby" as Screen },
          { t: "Party", s: `${PARTY.members.length} members`, k: "party" as Screen },
          { t: "Ranked queue", s: `Rating ${ME.rating}`, k: "queue" as Screen },
        ].map((a) => (
          <button key={a.t} onClick={() => go(a.k)} className={`${PANEL} p-4 text-left hover:border-amber-500/60 cursor-pointer`}>
            <div className="text-amber-100 font-semibold text-sm">{a.t}</div>
            <div className="text-amber-400/50 text-[11px] mt-0.5">{a.s}</div>
          </button>
        ))}
      </div>
      <div className={`${LABEL} mb-2`}>Active matches</div>
      <div className={`${PANEL} divide-y divide-amber-800/20`}>
        {MATCHES.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`w-2 h-2 rounded-full ${m.yourTurn ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]" : "bg-stone-600"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-amber-100 text-sm truncate">{m.name}</div>
              <div className="text-amber-400/50 text-[11px]">
                Round {m.round} · {m.ranked ? "Ranked" : "Casual"} · Glory {m.glory}
              </div>
            </div>
            <div className="text-right text-[11px]">
              <div className={m.yourTurn ? "text-red-300 font-semibold" : "text-amber-300/60"}>{m.yourTurn ? "Your turn" : m.waitingOn}</div>
              <div className="text-amber-400/50 tabular-nums">{m.hoursLeft} h left</div>
            </div>
            <button className={SECONDARY}>Open</button>
          </div>
        ))}
      </div>
    </>
  );
}

function Room() {
  const [seats, setSeats] = useState(ROOM.seats);
  const [s, setS] = useState(ROOM.settings);
  const { copied, copy } = useCopy();
  return (
    <>
      <TopBar title={ROOM.name}>
        <span className="text-amber-400/60 text-xs">{s.visibility} · {s.ranked ? "Ranked" : "Casual"}</span>
      </TopBar>
      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div>
          <div className={`${LABEL} mb-2`}>Seats · {seats.slice(0, s.seats).filter((x) => x.kind === "filled").length}/{s.seats}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {seats.slice(0, s.seats).map((seat, i) =>
              seat.kind === "filled" ? (
                <div key={i} className={`${PANEL} p-4 flex flex-col items-center gap-2 ${seat.party ? "!border-emerald-600/40" : ""}`}>
                  <Seal player={seat.player} size="lg" />
                  <div className="text-amber-100 text-sm font-semibold text-center">{seat.player.name}</div>
                  <div className="flex gap-1 text-[10px] uppercase tracking-wider">
                    {seat.host && <span className="px-1.5 rounded bg-amber-700/50 text-amber-100">Host</span>}
                    {seat.party && <span className="px-1.5 rounded bg-emerald-800/50 text-emerald-200">Party</span>}
                    <span className="text-amber-400/60">{seat.player.rating}</span>
                  </div>
                  <button
                    onClick={() => setSeats((x) => x.map((y, j) => (j === i && y.kind === "filled" ? { ...y, ready: !y.ready } : y)))}
                    className={`text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full cursor-pointer ${seat.ready ? "bg-emerald-700/60 text-emerald-100" : "bg-stone-700/60 text-stone-300"}`}
                  >
                    {seat.ready ? "Ready" : "Not ready"}
                  </button>
                </div>
              ) : (
                <button key={i} onClick={() => copy(ROOM.inviteLink)} className="rounded-xl border-2 border-dashed border-amber-800/40 p-4 flex flex-col items-center justify-center gap-2 text-amber-500/50 hover:text-amber-300 hover:border-amber-600/50 cursor-pointer min-h-[170px]">
                  <span className="text-3xl">+</span>
                  <span className="text-[11px] uppercase tracking-wider">Open seat · invite</span>
                </button>
              )
            )}
          </div>
        </div>
        <div className={`${PANEL} p-4 space-y-4 h-fit`}>
          <div className={LABEL}>Settings</div>
          <Field label="Seats">
            <input type="range" min={2} max={6} value={s.seats} onChange={(e) => setS({ ...s, seats: Number(e.target.value) })} className="w-full accent-amber-500" />
            <span className="text-amber-100 text-sm w-4 text-right">{s.seats}</span>
          </Field>
          <Seg label="Map size" options={["Small", "Medium", "Large"]} value={s.mapSize} onPick={(v) => setS({ ...s, mapSize: v as typeof s.mapSize })} />
          <Seg label="Turn timer" options={["24 h async", "2 min live"]} value={s.timer} onPick={(v) => setS({ ...s, timer: v as typeof s.timer })} />
          <Seg label="Mode" options={["Casual", "Ranked"]} value={s.ranked ? "Ranked" : "Casual"} onPick={(v) => setS({ ...s, ranked: v === "Ranked" })} />
          <Seg label="Visibility" options={["Private", "Public"]} value={s.visibility} onPick={(v) => setS({ ...s, visibility: v as typeof s.visibility })} />
          <Field label="Seed">
            <input value={s.seed} readOnly className="w-full bg-stone-900/80 border border-amber-800/40 rounded px-2 py-1 text-xs font-mono text-amber-100" />
            <button className={SECONDARY}>↻</button>
          </Field>
          <div>
            <div className={`${LABEL} mb-1`}>Invite link</div>
            <div className="flex gap-2">
              <input value={ROOM.inviteLink} readOnly className="flex-1 min-w-0 bg-stone-900/80 border border-amber-800/40 rounded px-2 py-1 text-[11px] font-mono text-amber-200" />
              <button onClick={() => copy(ROOM.inviteLink)} className={SECONDARY}>{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
          <button className={`${PRIMARY} w-full !py-3`}>Start match</button>
          <div className="text-amber-400/50 text-[11px] text-center -mt-2">1 player not ready</div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-amber-300/60 text-xs mb-1">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Seg({ label, options, value, onPick }: { label: string; options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex w-full rounded-md border border-amber-800/40 overflow-hidden">
        {options.map((o) => (
          <button key={o} onClick={() => onPick(o)} className={`flex-1 py-1 text-[11px] cursor-pointer ${o === value ? "bg-amber-700/70 text-amber-50" : "text-amber-300/60 hover:bg-amber-900/30"}`}>
            {o}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Lobby({ go }: VariantProps) {
  const [filter, setFilter] = useState<"All" | "Async" | "Live">("All");
  const rooms = PUBLIC_ROOMS.filter((r) => filter === "All" || (filter === "Live") === r.timer.includes("live"));
  return (
    <>
      <TopBar title="Lobby">
        <div className="flex rounded-md border border-amber-800/40 overflow-hidden">
          {(["All", "Async", "Live"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-[11px] cursor-pointer ${f === filter ? "bg-amber-700/70 text-amber-50" : "text-amber-300/60"}`}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={() => go("room")} className={PRIMARY}>Create room</button>
      </TopBar>
      <div className={`${PANEL} overflow-hidden`}>
        <div className="hidden sm:grid grid-cols-[2fr_1.3fr_0.8fr_1fr_1fr_90px] gap-3 px-4 py-2 bg-black/30 text-[10px] uppercase tracking-[0.18em] text-amber-500/60">
          <span>Room</span>
          <span>Host</span>
          <span>Map</span>
          <span>Timer</span>
          <span>Seats</span>
          <span />
        </div>
        {rooms.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.3fr_0.8fr_1fr_1fr_90px] gap-x-3 gap-y-1 items-center px-4 py-3 border-t border-amber-800/20 hover:bg-amber-900/10">
            <span className="text-amber-100 text-sm font-semibold">{r.name}</span>
            <span className="text-amber-300/70 text-xs hidden sm:block">
              {r.host} <span className="text-amber-500/50">{r.hostRating}</span>
            </span>
            <span className="text-amber-300/70 text-xs hidden sm:block">{r.mapSize}</span>
            <span className={`text-xs hidden sm:block ${r.timer.includes("live") ? "text-sky-300/80" : "text-amber-300/70"}`}>{r.timer}</span>
            <span className="hidden sm:flex gap-0.5">
              {Array.from({ length: r.seats }).map((_, k) => (
                <span key={k} className={`w-2.5 h-2.5 rounded-sm ${k < r.filled ? "bg-amber-500/80" : "bg-stone-700"}`} />
              ))}
            </span>
            <button onClick={() => go("room")} className={`${SECONDARY} row-span-2 sm:row-span-1`}>Join</button>
            <span className="sm:hidden text-amber-400/60 text-[11px]">
              {r.host} · {r.mapSize} · {r.timer} · {r.seats - r.filled} free
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Party() {
  const [chat, setChat] = useState<ChatLine[]>([...PARTY_CHAT]);
  const [draft, setDraft] = useState("");
  return (
    <>
      <TopBar title="Party">
        <button className={SECONDARY}>Leave party</button>
        <button className={PRIMARY}>Invite friends</button>
      </TopBar>
      <div className="grid lg:grid-cols-[260px_1fr] gap-5 h-[calc(100%-4rem)]">
        <div className={`${PANEL} p-4 space-y-3 h-fit`}>
          <div className={LABEL}>Members</div>
          {PARTY.members.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Seal player={p} size="md" />
              <div className="flex-1">
                <div className="text-amber-100 text-sm font-semibold">
                  {p.name} {p.id === PARTY.leaderId && <span className="text-amber-400 text-[10px] uppercase tracking-wider ml-1">Leader</span>}
                </div>
                <div className="text-amber-400/50 text-[11px] flex items-center gap-1.5">
                  <PresenceDot presence={p.presence} /> {PRESENCE_LABEL[p.presence]} · {p.rating}
                </div>
              </div>
            </div>
          ))}
          <div className={`${LABEL} pt-2`}>Invite</div>
          {FRIENDS.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm text-amber-200/70">
              <PresenceDot presence={f.presence} />
              <span className="flex-1">{f.name}</span>
              <button className={SECONDARY}>+</button>
            </div>
          ))}
        </div>
        <div className={`${PANEL} p-4 flex flex-col min-h-[320px]`}>
          <div className={`${LABEL} mb-3`}>Party chat</div>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {chat.map((c, i) => (
              <div key={i} className="flex gap-2.5">
                <Seal player={PARTY.members.find((m) => m.name === c.from) ?? ME} size="sm" />
                <div>
                  <div className="text-[11px] text-amber-400/70">
                    {c.from} <span className="text-amber-600/50">{c.at}</span>
                  </div>
                  <div className="text-amber-100/90 text-sm">{c.text}</div>
                </div>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) setChat((c) => [...c, { from: ME.name, text: draft.slice(0, 500), at: "20:45" }]);
              setDraft("");
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Message your party (500 max)" className="flex-1 bg-stone-900/80 border border-amber-800/40 rounded-lg px-3 py-2 text-sm text-amber-100 outline-none" />
            <button className={PRIMARY}>Send</button>
          </form>
        </div>
      </div>
    </>
  );
}

function Queue({ go }: VariantProps) {
  const t = useCountUp(QUEUE.elapsed);
  const pct = Math.min(1, t / QUEUE.relaxAfter);
  const R = 70;
  const C = 2 * Math.PI * R;
  return (
    <>
      <TopBar title="Ranked queue">
        <span className="text-amber-400/60 text-xs">Rating {ME.rating} · OpenSkill</span>
      </TopBar>
      <div className="grid lg:grid-cols-[280px_1fr] gap-5">
        <div className={`${PANEL} p-6 flex flex-col items-center`}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(120,53,15,0.4)" strokeWidth="10" />
            <circle cx="90" cy="90" r={R} fill="none" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 90 90)" />
            <text x="90" y="88" textAnchor="middle" className="fill-amber-100 font-heading" fontSize="30">
              {formatClock(t)}
            </text>
            <text x="90" y="112" textAnchor="middle" className="fill-amber-400/70" fontSize="11">
              {QUEUE.found.length} / {QUEUE.target} found
            </text>
          </svg>
          <div className="text-amber-300/60 text-xs text-center mt-2">
            Looking for {QUEUE.target}. After {formatClock(QUEUE.relaxAfter)} the match starts with {QUEUE.minimum} or more.
          </div>
          <button onClick={() => go("home")} className={`${SECONDARY} mt-4 !text-red-200 !border-red-800/50`}>Cancel search</button>
        </div>
        <div className={`${PANEL} p-4`}>
          <div className={`${LABEL} mb-3`}>Players found</div>
          <div className="space-y-2">
            {Array.from({ length: QUEUE.target }).map((_, i) => {
              const p = QUEUE.found[i];
              const party = p && PARTY.members.some((m) => m.id === p.id);
              return (
                <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${p ? "bg-black/20" : "border border-dashed border-amber-800/30"}`}>
                  {p ? <Seal player={p} size="sm" /> : <div className="w-7 h-7 rounded-full bg-stone-800 animate-pulse" />}
                  <span className={`flex-1 text-sm ${p ? "text-amber-100" : "text-amber-600/40 italic"}`}>{p ? p.name : "Searching…"}</span>
                  {party && <span className="text-[10px] uppercase tracking-wider px-1.5 rounded bg-emerald-800/50 text-emerald-200">Party</span>}
                  {p && <span className="text-amber-400/60 text-xs tabular-nums">{p.rating}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

const SCREENS: Record<Screen, (p: VariantProps) => ReactNode> = { signin: SignIn, home: Home, room: Room, lobby: Lobby, party: Party, queue: Queue };

export function VariantB({ screen, go }: VariantProps) {
  const Body = SCREENS[screen];
  if (screen === "signin") return <Body screen={screen} go={go} />;
  return (
    <div className="absolute inset-0 flex flex-col sm:flex-row bg-[#0e0b08] bg-[radial-gradient(ellipse_at_top,rgba(120,53,15,0.18),transparent_60%)]">
      <NavRail screen={screen} go={go} />
      {screen !== "party" && <PartyDock go={go} compact />}
      <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-8 pb-24">
        <Body screen={screen} go={go} />
      </main>
      {screen !== "party" && <PartyDock go={go} />}
    </div>
  );
}
