/**
 * PROTOTYPE variant C, "Captain's log": the fight is written up as it happens
 * in an open logbook. The left page keeps the ships' particulars as inked
 * tallies over engraved profiles, and the running log; the right page is the
 * business at hand, an order ticked and signed, or the reckoning of the guns.
 */
import { useState, type ReactNode } from "react";
import { BTN_BRASS } from "../../online/shellStyles";
import type { Aim, Order, ProtoShip, VariantProps } from "./fakeCombat";
import { AIM_INFO, ATTACKER, BYSTANDER, DEFENDER, DEFENDER_AFTER, ESCAPE, MATCHUP, ORDER_INFO, ROUND, VOLLEY } from "./fakeCombat";
import { SeaBackdrop } from "./SeaBackdrop";

const INK = "text-[#3a2414]";
const PAPER =
  "bg-[#efe2bf] bg-[repeating-linear-gradient(180deg,transparent_0_27px,rgba(58,36,20,0.11)_27px_28px),radial-gradient(ellipse_at_50%_40%,rgba(255,250,230,0.5),transparent_70%)]";

/** Ink tally marks: five-bar gates, lost marks struck in red. */
function Tally({ count, lost = 0 }: { count: number; lost?: number }) {
  const marks = Array.from({ length: count + lost }, (_, i) => i);
  return (
    <span className="inline-flex items-end gap-[3px]" aria-label={`${count}`}>
      {marks.map((i) => (
        <span key={i} className={`relative inline-block h-[17px] w-[2px] -skew-x-6 rounded-full ${i >= count ? "bg-[#3a2414]/35" : "bg-[#3a2414]"}`}>
          {i >= count && <span className="absolute -left-[5px] top-1/2 h-[2px] w-[12px] -rotate-[30deg] bg-[#8a2617]" />}
        </span>
      ))}
    </span>
  );
}

/** A line drawing of the ship, side-on, with crosses where shot struck. */
function Profile({ marks = [], flip = false }: { marks?: { x: number; y: number }[]; flip?: boolean }) {
  return (
    <svg viewBox="0 0 200 110" className="h-[92px] w-[168px] shrink-0" fill="none" stroke="#3a2414" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <g transform={flip ? "translate(200 0) scale(-1 1)" : undefined}>
        <path d="M20 80 L180 80 L170 98 Q100 104 32 98 Z" />
        <path d="M30 86 L172 86" strokeWidth={0.7} />
        {[50, 100, 148].map((x) => (
          <g key={x}>
            <path d={`M${x} 80 L${x} 12`} />
            <path d={`M${x - 20} 24 Q${x} 20 ${x + 20} 24 L${x + 18} 46 Q${x} 49 ${x - 18} 46 Z`} />
            <path d={`M${x - 24} 50 Q${x} 46 ${x + 24} 50 L${x + 22} 74 Q${x} 77 ${x - 22} 74 Z`} />
            <path d={`M${x - 14} 30 L${x + 14} 30 M${x - 17} 58 L${x + 17} 58`} strokeWidth={0.5} />
          </g>
        ))}
        <path d="M20 78 L2 60" />
      </g>
      {marks.map((m, i) => (
        <path key={i} d={`M${m.x - 6} ${m.y - 6} L${m.x + 6} ${m.y + 6} M${m.x + 6} ${m.y - 6} L${m.x - 6} ${m.y + 6}`} stroke="#8a2617" strokeWidth={2.4} />
      ))}
    </svg>
  );
}

function Particulars({ ship, after, marks, flip }: { ship: ProtoShip; after?: ProtoShip; marks?: { x: number; y: number }[]; flip?: boolean }) {
  const now = after ?? ship;
  const rows: [string, number, number][] = [
    ["Hull", now.hull.current, ship.hull.current - now.hull.current],
    ["Crew", now.crew.current, ship.crew.current - now.crew.current],
    ["Guns", now.cannons.current, ship.cannons.current - now.cannons.current],
    ["Moves", now.moves.current, ship.moves.current - now.moves.current],
  ];
  return (
    <div className="flex items-start gap-3">
      <Profile marks={marks} flip={flip} />
      <div className="min-w-0 flex-1">
        <div className="font-fell text-[19px] leading-tight">
          The {ship.shipName} <span className="font-garamond text-[14px] italic">{ship.shipClass.toLowerCase()}, {ship.nation}</span>
        </div>
        <div className="font-garamond text-[14px] italic">{ship.captain}, master{ship.holdsGauge ? "; to windward" : ""}</div>
        <div className="mt-1 grid grid-cols-[52px_1fr] gap-y-0.5 font-garamond text-[14px]">
          {rows.map(([label, n, lost]) => (
            <div key={label} className="contents">
              <span>{label}</span>
              <Tally count={n} lost={lost} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Entry({ when, children }: { when: string; children: ReactNode }) {
  return (
    <p className="font-fell text-[16px] italic leading-[28px]">
      <span className="mr-2 font-fell-sc not-italic text-[#8a2617]">{when}</span>
      {children}
    </p>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="#3a2414" strokeWidth={1.4} aria-hidden="true">
      <path d="M3 4 L21 3 L20 21 L4 20 Z" />
      {on && <path d="M6 12 L10 17 L22 0" stroke="#8a2617" strokeWidth={2.6} strokeLinecap="round" />}
    </svg>
  );
}

function Compass() {
  return (
    <svg viewBox="0 0 80 80" className="h-[70px] w-[70px] shrink-0" fill="none" stroke="#3a2414" strokeWidth={1} aria-hidden="true">
      <circle cx="40" cy="40" r="34" />
      <circle cx="40" cy="40" r="28" strokeWidth={0.5} />
      <path d="M40 4 L45 40 L40 76 L35 40 Z" fill="rgba(58,36,20,0.15)" />
      <path d="M4 40 L40 35 L76 40 L40 45 Z" />
      <path d="M8 18 L66 40" stroke="#8a2617" strokeWidth={1.8} />
      <path d="M58 33 L68 40 L57 45" stroke="#8a2617" strokeWidth={1.8} />
      <text x="36" y="13" fontSize="8" fill="#3a2414" stroke="none" fontFamily="IM Fell English SC, serif">N</text>
    </svg>
  );
}

function Seal({ letter = "M" }: { letter?: string }) {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#b8382a,#6e140c)] font-fell text-[26px] text-[#f0c9a8] shadow-[0_2px_5px_rgba(0,0,0,0.5),inset_0_0_0_4px_rgba(0,0,0,0.15)]">
      {letter}
    </span>
  );
}

export function VariantLogbook({ step, seat, goTo }: VariantProps) {
  const [order, setOrder] = useState<Order>("broadside");
  const [aim, setAim] = useState<Aim>("high");
  const watching = step === 5 && seat === "bystander";
  const ink = watching ? "text-[#1f3a5a]" : INK;

  return (
    <div className="absolute inset-0">
      <SeaBackdrop smoke={step !== 1} dim={0.6} />
      <div className="absolute inset-0 grid place-items-center px-4 pb-12 pt-4">
        {/* the book */}
        <div className="flex h-[min(720px,calc(100vh-72px))] w-[min(1200px,96vw)] rounded-[10px] bg-[#4a1f14] p-[10px] shadow-[0_30px_70px_rgba(0,0,0,0.7)]">
          {/* left page */}
          <section className={`${PAPER} ${ink} relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-l-[4px] py-6 pl-12 pr-8 shadow-[inset_-30px_0_40px_-20px_rgba(60,30,10,0.45)]`}>
            <div className="absolute bottom-0 left-8 top-0 w-px bg-[#8a2617]/40" />
            <h2 className="font-fell-sc text-[22px] leading-none">{watching ? `The log of ${BYSTANDER.captain}` : "The log of the Resolute"}</h2>
            <p className="font-garamond text-[14px] italic">{watching ? "Watching from the Marguerite" : "Henry Morgan, master"}</p>
            <div className="mt-3 flex flex-col gap-3 border-y border-[#3a2414]/30 py-3">
              <Particulars ship={ATTACKER} />
              <Particulars ship={DEFENDER} after={step === 4 ? DEFENDER_AFTER : undefined} flip marks={step === 4 ? [{ x: 52, y: 30 }, { x: 100, y: 78 }, { x: 72, y: 92 }] : []} />
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-hidden">
              {step === 1 ? (
                <Entry when="4 bells">Sighted a French flute to leeward, deep laden.</Entry>
              ) : (
                <>
                  <Entry when="Round 1">Both ships ran out their guns and fired. Each holed once. Smoke lies thick between us.</Entry>
                  {step === 3 && <Entry when="Round 2">Orders opened. {MATCHUP.name}.</Entry>}
                  {step === 4 && (
                    <Entry when="Round 2">
                      Raked her stern: her mizzen sprung, a man killed, her side holed. She ran for the smoke and was caught.
                    </Entry>
                  )}
                  {step === 5 && <Entry when="Round 2">{watching ? "Morgan has written his order; l'Olonnais has not." : "Order written and sealed."}</Entry>}
                </>
              )}
            </div>
          </section>

          {/* gutter */}
          <div className="w-[3px] bg-[linear-gradient(90deg,#3a2414,#7a5530,#3a2414)]" />

          {/* right page */}
          <section className={`${PAPER} ${ink} relative flex min-w-0 flex-1 flex-col overflow-y-auto rounded-r-[4px] py-[3vh] pl-10 pr-10 shadow-[inset_30px_0_40px_-20px_rgba(60,30,10,0.45)]`}>
            {step === 1 && (
              <div className="flex flex-1 flex-col justify-center">
                <p className="font-garamond text-[15px] italic">The afternoon watch. Entered in every captain's log.</p>
                <h1 className="mt-3 font-fell text-[clamp(30px,3.3vw,46px)] italic leading-[1.15]">Henry Morgan declares an attack on François l'Olonnais.</h1>
                <svg viewBox="0 0 300 12" className="mt-2 h-3 w-72" aria-hidden="true">
                  <path d="M2 8 Q80 2 150 7 T298 5" stroke="#8a2617" strokeWidth={2} fill="none" strokeLinecap="round" />
                </svg>
                <div className="mt-8 flex items-center gap-4">
                  <Seal />
                  <button className={BTN_BRASS} onClick={() => goTo(2)}>
                    Write your order
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <>
                <h2 className="font-fell-sc text-[24px] leading-none">Orders for round {ROUND}</h2>
                <p className="font-garamond text-[14px] italic">Written in secret. Tick one.</p>
                <div className="mt-3 flex items-start gap-3 rounded-[2px] border border-dashed border-[#3a2414]/40 p-2.5">
                  <Compass />
                  <div className="font-fell text-[15px] italic leading-snug">
                    Wind on our quarter: we hold the weather gauge. We fire first in an exchange, and +1 on any escape roll.
                    <span className="mt-1 block">Smoke lies between us from the last round; it clears after this one.</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {(["broadside", "closeIn", "bearAway"] as const).map((o) => {
                    const info = ORDER_INFO[o];
                    const on = order === o;
                    return (
                      <div key={o}>
                        <button onClick={() => setOrder(o)} className="flex w-full items-start gap-3 text-left">
                          <Tick on={on} />
                          <span>
                            <span className={`font-fell text-[22px] leading-none ${on ? "" : "opacity-75"}`}>{info.name}</span>
                            <span className="ml-2 font-garamond text-[14px] italic">
                              {info.does} Beats {ORDER_INFO[info.beats].name.toLowerCase()}; loses to {ORDER_INFO[info.losesTo].name.toLowerCase()}.
                            </span>
                            {info.smoke && <span className="block font-garamond text-[14px] italic text-[#8a2617]">{info.smoke}</span>}
                          </span>
                        </button>
                        {o === "broadside" && on && (
                          <div className="ml-9 mt-1 flex gap-4">
                            {(["high", "low"] as const).map((a) => (
                              <button key={a} onClick={() => setAim(a)} className="flex items-start gap-1.5 text-left">
                                <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border border-[#3a2414] ${aim === a ? "bg-[#8a2617]" : ""}`} />
                                <span className="font-garamond text-[14px] leading-tight">
                                  <span className="font-fell text-[17px]">{AIM_INFO[a].name}</span>, {AIM_INFO[a].at}
                                  <span className="block italic opacity-80">{AIM_INFO[a].summary}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-auto flex items-end justify-between gap-4 pt-3">
                  <div className="font-fell text-[22px] italic">
                    <span className="mr-2 font-garamond text-[14px] not-italic">Signed</span>H. Morgan
                    <div className="h-px w-56 bg-[#3a2414]/60" />
                  </div>
                  <button className={BTN_BRASS} onClick={() => goTo(5)}>
                    Sign and seal
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="font-fell-sc text-[24px] leading-none">The orders, opened together</h2>
                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div className="border-r border-[#3a2414]/30 pr-4">
                    <p className="font-garamond text-[14px] italic">Morgan wrote</p>
                    <p className="font-fell text-[30px] leading-tight">Broadside</p>
                    <p className="font-fell text-[18px] italic">and fire high</p>
                  </div>
                  <div>
                    <p className="font-garamond text-[14px] italic">l'Olonnais wrote</p>
                    <p className="font-fell text-[30px] leading-tight">Bear away</p>
                  </div>
                </div>
                <div className="mt-10">
                  <p className="font-garamond text-[14px] italic">Broadside beats Bear away, so</p>
                  <p className="font-fell text-[clamp(38px,4vw,56px)] italic leading-none">{MATCHUP.name}</p>
                  <svg viewBox="0 0 300 12" className="mt-1 h-3 w-80" aria-hidden="true">
                    <path d="M2 6 Q90 11 160 5 T298 7" stroke="#8a2617" strokeWidth={2} fill="none" strokeLinecap="round" />
                  </svg>
                  <p className="mt-3 max-w-[460px] font-fell text-[18px] italic leading-snug">{MATCHUP.line}</p>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="font-fell-sc text-[24px] leading-none">The reckoning</h2>
                <p className="font-garamond text-[14px] italic">Four guns, fired high; 5 or better hits, then a die for where it lands.</p>
                <table className="mt-3 w-full border-collapse font-garamond text-[16px]">
                  <thead>
                    <tr className="border-b border-[#3a2414] text-left font-fell-sc text-[15px]">
                      <th className="py-1 font-normal">Gun</th>
                      <th className="font-normal">Rolled</th>
                      <th className="font-normal">Struck</th>
                      <th className="font-normal">Where</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VOLLEY.dice.map((d, i) => {
                      const hitIndex = VOLLEY.dice.slice(0, i + 1).filter((x) => x >= VOLLEY.hitOn).length - 1;
                      const hit = d >= VOLLEY.hitOn ? VOLLEY.hits[hitIndex] : null;
                      return (
                        <tr key={i} className="border-b border-[#3a2414]/25">
                          <td className="py-1 font-fell-sc">{["i", "ii", "iii", "iv"][i]}</td>
                          <td className="font-fell text-[18px]">{d}</td>
                          <td className="italic">{hit ? "hit" : "wide"}</td>
                          <td>{hit ? <span><span className="font-fell text-[18px] text-[#8a2617]">{hit.place}</span> <span className="italic opacity-75">(rolled {hit.d6})</span></span> : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <h3 className="mt-4 font-fell-sc text-[18px]">She bears away</h3>
                <div className="grid grid-cols-[1fr_auto] font-garamond text-[15px]">
                  <span className="italic">Belle Marie: die {ESCAPE.fleer.d6}, moves {ESCAPE.fleer.moves}, smoke {ESCAPE.fleer.smoke}</span>
                  <span className="font-fell text-[18px]">{ESCAPE.fleer.total}</span>
                  <span className="italic">Resolute: die {ESCAPE.pursuer.d6}, moves {ESCAPE.pursuer.moves}, gauge {ESCAPE.pursuer.gauge}</span>
                  <span className="border-b-2 border-double border-[#3a2414] font-fell text-[18px]">{ESCAPE.pursuer.total}</span>
                </div>
                <div className="mt-auto flex items-end justify-between gap-4 pt-3">
                  <p className="font-fell text-[22px] italic">{ESCAPE.line}</p>
                  <button className={BTN_BRASS} onClick={() => goTo(2)}>
                    Turn to round 3
                  </button>
                </div>
              </>
            )}

            {step === 5 && (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                {watching ? (
                  <>
                    <p className="font-garamond text-[15px] italic">Seen from the Marguerite, two leagues off</p>
                    <p className="mt-3 font-fell text-[34px] italic leading-tight">Morgan and l'Olonnais are writing their orders.</p>
                    <div className="mt-8 grid grid-cols-2 gap-10 font-fell text-[20px]">
                      <span className="flex flex-col items-center gap-2">
                        <Seal />
                        Morgan: sealed
                      </span>
                      <span className="flex flex-col items-center gap-2">
                        <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-current opacity-60">
                          <span className="animate-pulse">…</span>
                        </span>
                        l'Olonnais: writing
                      </span>
                    </div>
                    <button className="mt-10 font-garamond text-[15px] underline underline-offset-4">Skip the reveal for me</button>
                  </>
                ) : (
                  <>
                    <div className="relative grid h-40 w-64 place-items-center bg-[#e8d8ad] shadow-[0_6px_14px_rgba(0,0,0,0.3)] [clip-path:polygon(0_0,100%_0,100%_100%,0_100%)]">
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-[#ddca99] [clip-path:polygon(0_0,100%_0,50%_100%)]" />
                      <div className="relative mt-6">
                        <Seal />
                      </div>
                    </div>
                    <p className="mt-6 font-fell text-[30px] italic">Your order is sealed.</p>
                    <p className="font-garamond text-[15px] italic">Broadside, fire high. No one else can read it.</p>
                    <p className="mt-6 font-fell text-[20px]">
                      Waiting on François l'Olonnais <span className="animate-pulse">…</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
