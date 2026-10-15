/**
 * PROTOTYPE variant A, "Card table": the fight is played on a captain's chart
 * table. Each ship is a parchment ledger at either end; the orders are playing
 * cards dealt face down and turned together; the dice roll in a wooden tray.
 */
import { useState, type ReactNode } from "react";
import { NationFlag } from "../../board/NationFlag";
import { BTN_BRASS, BTN_INK, PARCHMENT_SHEET } from "../../online/shellStyles";
import type { Aim, Order, ProtoShip, VariantProps } from "./fakeCombat";
import {
  AIM_INFO,
  ATTACKER,
  BYSTANDER,
  DEFENDER,
  DEFENDER_AFTER,
  ESCAPE,
  MATCHUP,
  ORDER_INFO,
  ORDERS,
  ROUND,
  VOLLEY,
} from "./fakeCombat";
import { DieFace, OrderGlyph, PlaceGlyph } from "./glyphs";
import { SeaBackdrop } from "./SeaBackdrop";

const WOOD =
  "bg-shell-timber bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.13)_0_2px,transparent_2px_11px),repeating-linear-gradient(90deg,rgba(255,210,150,0.05)_0_1px,transparent_1px_37px),linear-gradient(180deg,#4b301b,#2a190c)]";
const CARD_SIZE = "w-[min(10.5vw,15vh)] aspect-[5/7]";

function Pips({ gauge, lost = 0, label }: { gauge: { current: number; max: number }; lost?: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <span className="font-garamond text-[15px] text-shell-ink-soft">{label}</span>
      <span className="flex gap-1" aria-label={`${label} ${gauge.current} of ${gauge.max}`}>
        {Array.from({ length: gauge.max }, (_, i) => {
          const isLost = i >= gauge.current && i < gauge.current + lost;
          const full = i < gauge.current;
          return (
            <span
              key={i}
              className={`relative h-3 w-3 rounded-full border border-shell-ink ${full ? "bg-shell-ink" : ""} ${isLost ? "bg-shell-ink-wax/30" : ""}`}
            >
              {isLost && <span className="absolute -inset-1 rotate-45 border-l-2 border-shell-ink-wax left-1/2" />}
            </span>
          );
        })}
      </span>
    </div>
  );
}

function Ledger({ ship, after, side }: { ship: ProtoShip; after?: ProtoShip; side: "left" | "right" }) {
  const now = after ?? ship;
  return (
    <section
      aria-label={`${ship.captain}'s ledger`}
      className={`${PARCHMENT_SHEET} w-[clamp(200px,19vw,272px)] p-4 ${side === "left" ? "-rotate-[1.2deg]" : "rotate-[1deg]"} shadow-[0_10px_24px_rgba(0,0,0,0.55)]`}
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm ring-1 ring-shell-ink/40" style={{ backgroundColor: ship.color }} />
        <span className="font-garamond text-[13px] text-shell-ink-soft">{ship.seat}</span>
        <NationFlag nation={ship.nation} size="md" className="ml-auto" />
      </div>
      <h3 className="mt-1 font-fell text-[22px] leading-tight">{ship.captain}</h3>
      <p className="font-garamond text-[15px] italic text-shell-ink-soft">
        {ship.shipClass} <span className="not-italic">{ship.shipName}</span>
      </p>
      <div className="mt-2 border-t border-shell-ink/30 pt-1.5">
        <Pips label="Hull" gauge={now.hull} lost={ship.hull.current - now.hull.current} />
        <Pips label="Crew" gauge={now.crew} lost={ship.crew.current - now.crew.current} />
        <Pips label="Cannons" gauge={now.cannons} lost={ship.cannons.current - now.cannons.current} />
        <Pips label="Moves" gauge={now.moves} lost={ship.moves.current - now.moves.current} />
      </div>
      <p className="mt-1.5 font-garamond text-[14px] text-shell-ink-soft">Hold: {now.cargo.join(", ")}</p>
      {ship.holdsGauge && (
        <p className="mt-2 flex items-center gap-1.5 rounded-[2px] bg-shell-ink/8 px-2 py-1 font-garamond text-[14px]">
          <WindVane className="h-4 w-4" /> Holds the weather gauge
        </p>
      )}
    </section>
  );
}

function WindVane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M3 12 L19 12 M15 8 L19 12 L15 16" />
      <path d="M3 8 L6 12 L3 16" />
    </svg>
  );
}

function CardFace({ order, aim, selected, dimmed, onClick }: { order: Order; aim?: Aim; selected?: boolean; dimmed?: boolean; onClick?: () => void }) {
  const info = ORDER_INFO[order];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`${CARD_SIZE} relative flex flex-col rounded-[8px] bg-[#f3e6c4] p-[5%] text-shell-ink shadow-[0_8px_18px_rgba(0,0,0,0.5)] transition-transform ${onClick ? "cursor-pointer hover:-translate-y-2" : ""} ${selected ? "-translate-y-5 ring-4 ring-shell-gold" : ""} ${dimmed ? "opacity-60 grayscale-[60%]" : ""}`}
    >
      <div className="flex h-full flex-col items-center rounded-[5px] border-2 border-double border-shell-ink/70 px-1 py-1.5">
        <span className="self-start font-fell-sc text-[clamp(11px,1.1vw,15px)] leading-none">{info.name}</span>
        <OrderGlyph order={order} className="my-auto h-[48%] w-[70%] text-shell-ink" />
        {aim && <span className="font-fell text-[clamp(11px,1vw,14px)] italic text-shell-ink-wax">{AIM_INFO[aim].name}</span>}
        <span className="mt-0.5 text-center font-garamond text-[clamp(10px,0.9vw,13px)] leading-tight text-shell-ink-soft">
          beats {ORDER_INFO[info.beats].name}
        </span>
      </div>
    </Tag>
  );
}

function CardBack({ sealed = true, label, seal = "M" }: { sealed?: boolean; label?: string; seal?: string }) {
  return (
    <div className={`${CARD_SIZE} relative grid place-items-center rounded-[8px] bg-[#5a1d14] p-[6%] shadow-[0_8px_18px_rgba(0,0,0,0.5)]`}>
      <div className="absolute inset-[6%] rounded-[5px] border border-shell-gold/60 bg-[repeating-linear-gradient(45deg,rgba(230,199,126,0.18)_0_2px,transparent_2px_8px),repeating-linear-gradient(-45deg,rgba(230,199,126,0.18)_0_2px,transparent_2px_8px)]" />
      {sealed && (
        <div className="relative grid h-[34%] aspect-square place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#c0392b,#7a1a10)] font-fell text-[clamp(14px,1.6vw,24px)] text-[#f3d1b0] shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
          {seal}
        </div>
      )}
      {label && <span className="absolute bottom-[8%] font-garamond text-[12px] text-shell-gold">{label}</span>}
    </div>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className={`${CARD_SIZE} grid place-items-center rounded-[8px] border-2 border-dashed border-shell-gold/40 p-3 text-center font-garamond text-[clamp(12px,1.05vw,15px)] italic text-shell-gold/80`}>
      <span>
        {label}
        <span className="mt-2 block animate-pulse text-[22px] not-italic leading-none">· · ·</span>
      </span>
    </div>
  );
}

function Token({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-[270px] items-start gap-2.5">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#5c3f15] bg-[radial-gradient(circle_at_35%_30%,#f0d48e,#b98b3e_60%,#7d5a22)] text-shell-ink shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
        <WindVane className="h-6 w-6" />
      </div>
      <div className="font-garamond text-[13px] leading-snug text-[#ecdcb4]">
        <div className="font-fell text-[17px] text-shell-gold">{title}</div>
        {children}
      </div>
    </div>
  );
}

function SmokeToken() {
  return (
    <div className="flex max-w-[290px] items-start gap-2.5">
      <div className="h-11 w-11 shrink-0 rounded-full border-2 border-[#6d6457] bg-[radial-gradient(circle_at_35%_30%,#e6dfd2,#a59a8a_60%,#6d6457)] shadow-[0_3px_6px_rgba(0,0,0,0.5)]" />
      <div className="font-garamond text-[13px] leading-snug text-[#ecdcb4]">
        <div className="font-fell text-[17px] text-shell-gold">Smoke on the water</div>
        Last round's broadsides left a bank between you. Bear away gets +2 to escape; Close in is a 4+ gamble.
      </div>
    </div>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto mt-[4vh] w-fit max-w-[min(1100px,92vw)]">
      <div className="absolute -left-6 top-3 h-full w-10 bg-[#c9b07c] [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,35%_50%)]" />
      <div className="absolute -right-6 top-3 h-full w-10 bg-[#c9b07c] [clip-path:polygon(0_0,100%_0,65%_50%,100%_100%,0_100%)]" />
      <div className={`${PARCHMENT_SHEET} relative px-10 py-4 text-center shadow-[0_10px_30px_rgba(0,0,0,0.5)]`}>{children}</div>
    </div>
  );
}

export function VariantCardTable({ step, seat, goTo }: VariantProps) {
  const [order, setOrder] = useState<Order>("broadside");
  const [aim, setAim] = useState<Aim>("high");
  const watching = step === 5 && seat === "bystander";
  const after = step === 4 ? DEFENDER_AFTER : undefined;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-[0_0_clamp(150px,30vh,320px)]">
        <SeaBackdrop smoke={step !== 1} dim={0.15} defenderDamaged={step === 4} attackerFiring={step === 4} />
        {step === 1 && (
          <Banner>
            <p className="font-garamond text-[15px] text-shell-ink-soft">Seen by every captain at the table</p>
            <h1 className="font-fell text-[clamp(20px,2.2vw,32px)] leading-tight">
              Henry Morgan declares an attack on François l'Olonnais
            </h1>
          </Banner>
        )}
        {step !== 1 && (
          <div className="absolute left-4 top-3 rounded-[3px] bg-black/55 px-3 py-1.5 font-fell text-[18px] text-shell-gold">
            Round {ROUND}{watching ? `: you are watching, ${BYSTANDER.captain} (${BYSTANDER.seat})` : ""}
          </div>
        )}
      </div>

      <div className={`${WOOD} relative flex min-h-0 flex-1 items-stretch justify-between gap-4 border-t-4 border-[#8c6526] px-[2vw] pb-12 pt-[2.5vh] shadow-[inset_0_12px_30px_rgba(0,0,0,0.6)]`}>
        <div className="shrink-0">
          <Ledger ship={ATTACKER} side="left" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center-safe gap-[2vh] overflow-y-auto">
          {step === 1 && (
            <>
              <div className="flex items-end gap-6">
                <CardBack sealed={false} />
                <div className="max-w-[340px] font-garamond text-[16px] leading-snug text-[#ecdcb4]">
                  <p className="font-fell text-[22px] text-shell-gold">Each captain will play an order</p>
                  <p className="mt-1">
                    Broadside, Close in or Bear away, chosen in secret. The two cards turn over together, and the matchup decides what happens.
                  </p>
                </div>
              </div>
              <button className={BTN_BRASS} onClick={() => goTo(2)}>
                Take the helm
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
                <Token title="The weather gauge is yours">You are upwind: you fire first if she fires too, and +1 on escape rolls.</Token>
                <SmokeToken />
              </div>
              <div className="flex items-end gap-[1.5vw] pt-3">
                {(["broadside", "closeIn", "bearAway"] as const).map((o, i) => (
                  <div key={o} className={i === 0 ? "-rotate-6" : i === 2 ? "rotate-6" : ""}>
                    <CardFace order={o} selected={order === o} onClick={() => setOrder(o)} aim={o === "broadside" && order === o ? aim : undefined} />
                  </div>
                ))}
                <div className="ml-[2vw]">
                  <EmptySlot label="l'Olonnais is choosing" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {order === "broadside" &&
                  (["high", "low"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAim(a)}
                      className={`rounded-[3px] border px-3 py-1.5 text-left transition ${aim === a ? "border-shell-gold bg-[#f3e6c4] text-shell-ink" : "border-shell-gold/40 bg-black/25 text-[#ecdcb4] hover:bg-black/40"}`}
                    >
                      <span className="block font-fell text-[16px]">{AIM_INFO[a].name}</span>
                      <span className="flex gap-1 font-garamond text-[12px]">
                        {AIM_INFO[a].table.map((p, i) => (
                          <span key={i} className="flex items-center gap-0.5" title={`${i + 1}: ${p}`}>
                            {i + 1}
                            <PlaceGlyph place={p} className="h-3.5 w-3.5" />
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                {order !== "broadside" && (
                  <p className="max-w-[420px] font-garamond text-[15px] text-[#ecdcb4]">
                    {ORDER_INFO[order].does} {ORDER_INFO[order].smoke}
                  </p>
                )}
                <button className={BTN_BRASS} onClick={() => goTo(5)}>
                  Seal the order
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-[3vw] pt-2">
                <div className="flex flex-col items-center gap-2">
                  <CardFace order={ORDERS.attacker.order} aim={ORDERS.attacker.aim} />
                  <span className="font-garamond text-[14px] text-[#ecdcb4]">Morgan</span>
                </div>
                <div className="font-fell text-[30px] italic text-shell-gold">beats</div>
                <div className="flex flex-col items-center gap-2 rotate-3">
                  <CardFace order={ORDERS.defender.order} dimmed />
                  <span className="font-garamond text-[14px] text-[#ecdcb4]">l'Olonnais</span>
                </div>
              </div>
              <div className={`${PARCHMENT_SHEET} max-w-[560px] px-6 py-3 text-center`}>
                <h2 className="font-fell text-[28px] leading-tight">{MATCHUP.name}</h2>
                <p className="font-garamond text-[16px]">{MATCHUP.line}</p>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center gap-4 rounded-[6px] border-4 border-[#24160b] bg-[#1b3a2c] bg-[radial-gradient(ellipse_at_center,#24503b,#132b20)] px-5 py-3 shadow-[inset_0_4px_14px_rgba(0,0,0,0.7)]">
                <span className="font-fell text-[16px] text-shell-gold">Morgan's guns, 5+ hits</span>
                {VOLLEY.dice.map((d, i) => (
                  <div key={i} className={`grid h-12 w-12 place-items-center rounded-[8px] bg-[linear-gradient(160deg,#fbf3df,#d9caa6)] shadow-[0_3px_0_#8d7c58,0_5px_8px_rgba(0,0,0,0.5)] ${d >= VOLLEY.hitOn ? "" : "opacity-45"}`}>
                    <DieFace value={d} className="h-9 w-9" pipClassName={d >= VOLLEY.hitOn ? "fill-shell-ink-wax" : "fill-shell-ink"} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {VOLLEY.hits.map((h) => (
                  <div key={h.place} className={`${PARCHMENT_SHEET} flex w-[clamp(150px,13vw,180px)] items-center gap-2 px-2.5 py-1.5`}>
                    <DieFace value={h.d6} className="h-7 w-7 shrink-0 rounded-[4px] border border-shell-ink/50 bg-[#fbf3df]" pipClassName="fill-shell-ink" />
                    <PlaceGlyph place={h.place} className="h-7 w-7 shrink-0 text-shell-ink-wax" />
                    <div className="leading-tight">
                      <div className="font-fell text-[18px]">{h.place}</div>
                      <div className="font-garamond text-[13px] text-shell-ink-soft">{h.effect}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="w-full max-w-[560px] rounded-[3px] bg-black/30 px-4 py-2 font-garamond text-[15px] text-[#ecdcb4]">
                <div className="flex justify-between">
                  <span>She bears away: {ESCAPE.fleer.d6} + {ESCAPE.fleer.moves} move + {ESCAPE.fleer.smoke} smoke</span>
                  <span className="font-fell text-[18px] text-shell-gold">{ESCAPE.fleer.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Morgan gives chase: {ESCAPE.pursuer.d6} + {ESCAPE.pursuer.moves} moves + {ESCAPE.pursuer.gauge} gauge</span>
                  <span className="font-fell text-[18px] text-shell-gold">{ESCAPE.pursuer.total}</span>
                </div>
                <p className="mt-1 border-t border-shell-gold/30 pt-1 font-fell text-[17px]">{ESCAPE.line}</p>
              </div>
              <button className={BTN_BRASS} onClick={() => goTo(2)}>
                Deal round 3
              </button>
            </>
          )}

          {step === 5 && (
            <>
              <p className="max-w-[560px] text-center font-garamond text-[17px] text-[#ecdcb4]">
                {watching
                  ? "Two captains are choosing in secret. The cards turn over when both are down."
                  : "Your order is sealed. Only you can see it until both cards are down."}
              </p>
              <div className="flex items-center gap-[4vw]">
                <div className="flex flex-col items-center gap-2">
                  <CardBack label={watching ? "Sealed" : "Broadside, fire high"} />
                  <span className="font-garamond text-[14px] text-[#ecdcb4]">Morgan has played</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <EmptySlot label="l'Olonnais is choosing" />
                  <span className="font-garamond text-[14px] text-[#ecdcb4]">&nbsp;</span>
                </div>
              </div>
              {watching ? (
                <button className={BTN_INK}>Skip the reveal for me</button>
              ) : null}
            </>
          )}
        </div>

        <div className="shrink-0">
          <Ledger ship={DEFENDER} after={after} side="right" />
        </div>
      </div>
    </div>
  );
}
