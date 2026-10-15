/**
 * PROTOTYPE variant B, "Cinematic": the scene is the panel. Letterbox bars
 * close in when the fight starts; the words are big and few; the aim is picked
 * on the enemy ship itself (rigging or waterline), and the hits are pinned
 * where they land.
 */
import { useState, type ReactNode } from "react";
import type { Aim, Order, VariantProps } from "./fakeCombat";
import { AIM_INFO, ATTACKER, DEFENDER, DEFENDER_AFTER, ESCAPE, MATCHUP, ORDER_INFO, ORDERS, ROUND, VOLLEY } from "./fakeCombat";
import { DieFace } from "./glyphs";
import { SeaBackdrop } from "./SeaBackdrop";

const IVORY = "text-[#f3e6c8]";
const SHADOW = "[text-shadow:0_2px_18px_rgba(0,0,0,0.85)]";

function Bar({ position, children }: { position: "top" | "bottom"; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-x-0 ${position === "top" ? "top-0" : "bottom-0 pb-12"} z-10 flex min-h-[13vh] items-center pt-2 gap-6 bg-[#050403] px-[4vw] ${IVORY}`}
    >
      {children}
    </div>
  );
}

function WindLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 font-garamond text-[16px]">
      <svg viewBox="0 0 80 16" className="h-4 w-20 text-shell-gold" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path d="M0 8 L74 8 M66 2 L76 8 L66 14" />
        <path d="M6 4 Q14 8 6 12 M18 4 Q26 8 18 12" opacity={0.6} />
      </svg>
      {label}
    </div>
  );
}

/** A dashed target on the enemy ship, in the backdrop's SVG space. */
function AimZone({ aim, chosen, onPick, x, y, w, h }: { aim: Aim; chosen: boolean; onPick: () => void; x: number; y: number; w: number; h: number }) {
  return (
    <g onClick={onPick} className="cursor-pointer" role="button" aria-label={AIM_INFO[aim].name}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={chosen ? "rgba(230,199,126,0.16)" : "rgba(0,0,0,0.001)"} stroke={chosen ? "#e6c77e" : "#f3e6c8"} strokeOpacity={chosen ? 1 : 0.55} strokeWidth={chosen ? 3 : 2} strokeDasharray="10 8" />
      <text x={x - 20} y={y + h / 2 + 4} textAnchor="end" fill={chosen ? "#e6c77e" : "#f3e6c8"} fontFamily="IM Fell English, Georgia, serif" fontSize={30}>
        {AIM_INFO[aim].name}
      </text>
      <text x={x - 20} y={y + h / 2 + 32} textAnchor="end" fill="#f3e6c8" opacity={0.85} fontFamily="EB Garamond, Georgia, serif" fontSize={22} style={{ paintOrder: "stroke" }} stroke="#000" strokeWidth={4} strokeOpacity={0.4}>
        {AIM_INFO[aim].summary}
      </text>
    </g>
  );
}

function HitPin({ x, y, d6, place, effect, labelLeft = false }: { x: number; y: number; d6: number; place: string; effect: string; labelLeft?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={30} fill="none" stroke="#e6c77e" strokeWidth={2} />
      <circle cx={x} cy={y} r={6} fill="#e6c77e" />
      <path d={labelLeft ? `M${x - 30} ${y} L${x - 90} ${y}` : `M${x + 30} ${y} L${x + 90} ${y}`} stroke="#e6c77e" strokeWidth={1.5} />
      <text x={labelLeft ? x - 100 : x + 100} y={y + 4} textAnchor={labelLeft ? "end" : "start"} fill="#f3e6c8" fontFamily="IM Fell English, Georgia, serif" fontSize={36} style={{ paintOrder: "stroke" }} stroke="#000" strokeWidth={6} strokeOpacity={0.5}>
        {place}
        <tspan fill="#e6c77e" fontSize={24}>{`  rolled ${d6}`}</tspan>
      </text>
      <text x={labelLeft ? x - 100 : x + 100} y={y + 34} textAnchor={labelLeft ? "end" : "start"} fill="#f3e6c8" fontFamily="EB Garamond, Georgia, serif" fontSize={22} style={{ paintOrder: "stroke" }} stroke="#000" strokeWidth={5} strokeOpacity={0.5}>
        {effect}
      </text>
    </g>
  );
}

function ShipLine({ name, hull, crew, moves, right = false }: { name: string; hull: string; crew: string; moves: string; right?: boolean }) {
  return (
    <div className={`font-garamond text-[15px] leading-tight ${right ? "text-right" : ""}`}>
      <div className="font-fell text-[20px] text-shell-gold">{name}</div>
      <div className="opacity-85">
        Hull {hull}, crew {crew}, moves {moves}
      </div>
    </div>
  );
}

export function VariantCinematic({ step, seat, goTo }: VariantProps) {
  const [order, setOrder] = useState<Order>("broadside");
  const [aim, setAim] = useState<Aim>("high");
  const watching = step === 5 && seat === "bystander";
  const g = (s: { current: number; max: number }) => `${s.current}/${s.max}`;

  return (
    <div className="absolute inset-0">
      <SeaBackdrop close smoke={step !== 1} dim={step === 5 ? 0.45 : step === 3 ? 0.35 : 0.1} defenderDamaged={step === 4} attackerFiring={step === 4}>
        {step === 2 && order === "broadside" && (
          <>
            <AimZone aim="high" chosen={aim === "high"} onPick={() => setAim("high")} x={940} y={340} w={420} h={200} />
            <AimZone aim="low" chosen={aim === "low"} onPick={() => setAim("low")} x={940} y={640} w={420} h={70} />
          </>
        )}
        {step === 4 && (
          <>
            <HitPin x={1051} y={505} d6={VOLLEY.hits[0].d6} place="Mast" effect={VOLLEY.hits[0].effect} labelLeft />
            <HitPin x={1150} y={630} d6={VOLLEY.hits[1].d6} place="Crew" effect={VOLLEY.hits[1].effect} labelLeft />
            <HitPin x={1230} y={690} d6={VOLLEY.hits[2].d6} place="Hull" effect={VOLLEY.hits[2].effect} />
          </>
        )}
      </SeaBackdrop>

      {/* top bar */}
      <Bar position="top">
        {step === 1 && <span className="font-garamond text-[16px] opacity-70">Every seat sees this</span>}
        {step === 2 && <WindLine label="The weather gauge is yours: you fire first, +1 to escape" />}
        {step === 3 && <span className="font-fell text-[22px]">Round {ROUND}: the orders turn</span>}
        {step === 4 && (
          <>
            <ShipLine name={`${ATTACKER.shipName}, Morgan`} hull={g(ATTACKER.hull)} crew={g(ATTACKER.crew)} moves={g(ATTACKER.moves)} />
            <span className="mx-auto font-fell text-[22px]">Round {ROUND}</span>
            <ShipLine right name={`${DEFENDER.shipName}, l'Olonnais`} hull={g(DEFENDER_AFTER.hull)} crew={g(DEFENDER_AFTER.crew)} moves={g(DEFENDER_AFTER.moves)} />
          </>
        )}
        {step === 2 && <span className="ml-auto font-garamond text-[16px] opacity-85">Smoke lies between you; it clears after this round</span>}
        {step === 5 && <span className="font-fell text-[22px]">Round {ROUND}</span>}
      </Bar>

      {/* the middle of the frame */}
      <div className={`pointer-events-none absolute inset-x-0 top-[13vh] bottom-[13vh] flex flex-col items-center justify-center text-center ${IVORY} ${SHADOW}`}>
        {step === 1 && (
          <>
            <div className="font-fell text-[clamp(44px,6vw,92px)] leading-none">Henry Morgan</div>
            <div className="my-3 font-fell text-[clamp(20px,2vw,30px)] italic text-shell-gold">declares an attack on</div>
            <div className="font-fell text-[clamp(44px,6vw,92px)] leading-none">François l'Olonnais</div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="flex items-baseline gap-[4vw]">
              <div>
                <div className="font-fell text-[clamp(44px,6vw,96px)] leading-none text-shell-gold">{ORDER_INFO[ORDERS.attacker.order].name}</div>
                <div className="mt-2 font-fell text-[24px] italic">{AIM_INFO.high.name}, Morgan</div>
              </div>
              <div>
                <div className="font-fell text-[clamp(44px,6vw,96px)] leading-none line-through decoration-2 opacity-70">{ORDER_INFO[ORDERS.defender.order].name}</div>
                <div className="mt-2 font-fell text-[24px] italic opacity-70">l'Olonnais</div>
              </div>
            </div>
            <div className="mt-[6vh] font-fell text-[clamp(30px,3.4vw,52px)]">{MATCHUP.name}</div>
          </>
        )}
        {step === 5 && !watching && (
          <>
            <div className="font-fell text-[clamp(30px,3.6vw,56px)]">Your order is sealed</div>
            <div className="mt-2 font-fell text-[22px] italic text-shell-gold">Broadside, fire high. Only you can see it.</div>
            <div className="mt-8 font-garamond text-[20px]">François l'Olonnais is choosing</div>
            <div className="mt-3 h-px w-56 animate-pulse bg-shell-gold" />
          </>
        )}
        {step === 5 && watching && (
          <>
            <div className="font-garamond text-[18px] opacity-80">You are watching from the Marguerite</div>
            <div className="mt-2 font-fell text-[clamp(30px,3.6vw,56px)]">Two captains choose in secret</div>
            <div className="mt-8 flex gap-16 font-fell text-[24px]">
              <span>
                Morgan <span className="text-shell-gold italic">has chosen</span>
              </span>
              <span>
                l'Olonnais <span className="animate-pulse italic opacity-70">is choosing</span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* bottom bar */}
      <Bar position="bottom">
        {step === 1 && (
          <>
            <ShipLine name={`Frigate ${ATTACKER.shipName}`} hull={g(ATTACKER.hull)} crew={g(ATTACKER.crew)} moves={g(ATTACKER.moves)} />
            <button className="mx-auto font-fell text-[22px] text-shell-gold underline decoration-1 underline-offset-8 hover:text-[#f3e6c8]" onClick={() => goTo(2)}>
              Give your order
            </button>
            <ShipLine right name={`Flute ${DEFENDER.shipName}`} hull={g(DEFENDER.hull)} crew={g(DEFENDER.crew)} moves={g(DEFENDER.moves)} />
          </>
        )}
        {step === 2 && (
          <>
            {(["broadside", "closeIn", "bearAway"] as const).map((o) => {
              const info = ORDER_INFO[o];
              const on = order === o;
              return (
                <button key={o} onClick={() => setOrder(o)} className={`flex-1 self-start border-t-2 pt-2 text-left transition-colors ${on ? "border-shell-gold" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <div className={`font-fell text-[clamp(26px,2.8vw,42px)] leading-none ${on ? "text-shell-gold" : ""}`}>{info.name}</div>
                  <div className="mt-1 font-garamond text-[14px] leading-snug">
                    Beats {ORDER_INFO[info.beats].name}. {info.smoke ?? info.does}
                  </div>
                </button>
              );
            })}
            <button className="shrink-0 font-fell text-[24px] text-shell-gold underline decoration-1 underline-offset-8" onClick={() => goTo(5)}>
              Seal it
            </button>
          </>
        )}
        {step === 3 && <p className="mx-auto max-w-[900px] text-center font-garamond text-[19px]">{MATCHUP.line}</p>}
        {step === 4 && (
          <>
            <div className="flex items-center gap-2">
              {VOLLEY.dice.map((d, i) => (
                <DieFace key={i} value={d} className={`h-9 w-9 rounded-[5px] border ${d >= VOLLEY.hitOn ? "border-shell-gold" : "border-white/25 opacity-50"}`} pipClassName={d >= VOLLEY.hitOn ? "fill-shell-gold" : "fill-[#f3e6c8]"} />
              ))}
              <span className="ml-2 font-garamond text-[15px] opacity-80">3 hits on 5+</span>
            </div>
            <div className="mx-auto font-garamond text-[17px]">
              She runs: {ESCAPE.fleer.d6} + {ESCAPE.fleer.moves} + {ESCAPE.fleer.smoke} smoke = <b className="font-fell text-[22px] font-normal">{ESCAPE.fleer.total}</b>
              <span className="mx-3 opacity-60">against</span>
              {ESCAPE.pursuer.d6} + {ESCAPE.pursuer.moves} + {ESCAPE.pursuer.gauge} gauge = <b className="font-fell text-[22px] font-normal text-shell-gold">{ESCAPE.pursuer.total}</b>
              <span className="ml-3 font-fell text-[22px] italic">Caught.</span>
            </div>
            <button className="shrink-0 font-fell text-[24px] text-shell-gold underline decoration-1 underline-offset-8" onClick={() => goTo(2)}>
              Round 3
            </button>
          </>
        )}
        {step === 5 && (
          <span className="mx-auto font-garamond text-[16px] opacity-75">
            {watching ? (
              <button className="underline underline-offset-4">Skip the reveal</button>
            ) : (
              "The orders turn together when both are in."
            )}
          </span>
        )}
      </Bar>
    </div>
  );
}
