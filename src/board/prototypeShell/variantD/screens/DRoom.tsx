import { useState, type ReactNode } from "react";
import { ROOM } from "../../fixtures";
import { Seal } from "../../primitives";
import { useCopy } from "../../shellHooks";
import { DIcon } from "../DIcon";
import { DSegmented } from "../DSegmented";
import { BTN_BRASS, BTN_INK, FELL, FOCUS_RING, GARAMOND, INK_SOFT, PARCHMENT_INSET, SECTION } from "../theme";

type Settings = typeof ROOM.settings;
const SEAT_OPTIONS = ["2", "3", "4", "5", "6"] as const;

/** THROWAWAY PROTOTYPE: variant D, a room you host. Berths on the left, the articles (settings) on the right. */
export function DRoom() {
  const [seats, setSeats] = useState(ROOM.seats);
  const [s, setS] = useState<Settings>(ROOM.settings);
  const { copied, copy } = useCopy();
  const visible = seats.slice(0, s.seats);
  const filled = visible.filter((x) => x.kind === "filled");
  const notReady = filled.filter((x) => x.kind === "filled" && !x.ready).length;
  const toggle = (i: number) => setSeats((x) => x.map((y, j) => (j === i && y.kind === "filled" ? { ...y, ready: !y.ready } : y)));

  return (
    <div className={`${GARAMOND} grid lg:grid-cols-[1fr_290px] gap-6`}>
      <section>
        <h2 className={`${SECTION} mb-3 lining-nums`}>
          Berths, {filled.length} of {s.seats} taken
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map((seat, i) =>
            seat.kind === "filled" ? (
              <li key={i} className={`relative flex flex-col items-center gap-1.5 px-2 pt-4 pb-3 rounded-[3px] border ${seat.party ? "border-[#3f7564]/60 bg-[#5f9a86]/10" : "border-[#7a5c3a]/40 bg-[#f1e6c8]/40"}`}>
                <Seal player={seat.player} size="lg" />
                <div className={`${FELL} text-[18px] leading-tight text-center text-[#2b1d10]`}>{seat.player.name}</div>
                <div className={`text-[14px] italic ${INK_SOFT} lining-nums`}>
                  {[seat.host && "host", seat.party && "your party", String(seat.player.rating)].filter(Boolean).join(", ")}
                </div>
                <button
                  onClick={() => toggle(i)}
                  aria-pressed={seat.ready}
                  className={`${FOCUS_RING} mt-1 px-3 py-0.5 rounded-full text-[14px] font-semibold border cursor-pointer active:translate-y-[1px] ${
                    seat.ready ? "bg-[#3f7564] border-[#24473c] text-[#eaf4ec] shadow-[0_2px_0_#24473c]" : "bg-[#efe3c2] border-[#7a5c3a] text-[#5c4630] shadow-[0_2px_0_#7a5c3a]"
                  }`}
                >
                  {seat.ready ? "Ready" : "Not ready"}
                </button>
              </li>
            ) : (
              <li key={i}>
                <button
                  onClick={() => copy(ROOM.inviteLink)}
                  className={`${FOCUS_RING} w-full h-full min-h-[168px] flex flex-col items-center justify-center gap-1.5 rounded-[3px] border-2 border-dashed border-[#7a5c3a]/50 text-[#6b4a20] hover:bg-[#f1e6c8]/50 cursor-pointer`}
                >
                  <DIcon name="plus" className="w-7 h-7" />
                  <span className="text-[16px] font-semibold">Open berth</span>
                  <span className="text-[14px] italic">Copy the invite link</span>
                </button>
              </li>
            )
          )}
        </ul>
      </section>

      <section className={`${PARCHMENT_INSET} p-4 space-y-3.5 h-fit`}>
        <h2 className={SECTION}>Articles of the voyage</h2>
        <Row label="Seats">
          <DSegmented label="Seats" options={SEAT_OPTIONS} value={String(s.seats) as (typeof SEAT_OPTIONS)[number]} onPick={(v) => setS({ ...s, seats: Number(v) })} />
        </Row>
        <Row label="Map size">
          <DSegmented label="Map size" options={["Small", "Medium", "Large"] as const} value={s.mapSize} onPick={(v) => setS({ ...s, mapSize: v })} />
        </Row>
        <Row label="Turn timer">
          <DSegmented label="Turn timer" options={["24 h async", "2 min live"] as const} value={s.timer} onPick={(v) => setS({ ...s, timer: v })} />
        </Row>
        <Row label="Mode">
          <DSegmented label="Mode" options={["Casual", "Ranked"] as const} value={s.ranked ? "Ranked" : "Casual"} onPick={(v) => setS({ ...s, ranked: v === "Ranked" })} />
        </Row>
        <Row label="Who can join">
          <DSegmented label="Who can join" options={["Private", "Public"] as const} value={s.visibility} onPick={(v) => setS({ ...s, visibility: v })} />
        </Row>
        <div className="flex items-center justify-between text-[15px]">
          <span className={INK_SOFT}>Map seed</span>
          <span className="lining-nums tabular-nums text-[#2b1d10]">{s.seed}</span>
        </div>
        <div>
          <div className={`text-[15px] ${INK_SOFT} mb-1`}>Invite link</div>
          <div className="flex gap-2">
            <input readOnly value={ROOM.inviteLink} aria-label="Invite link" className="flex-1 min-w-0 bg-[#f4ead0] border border-[#7a5c3a]/50 rounded-[2px] px-2 py-1 text-[14px] text-[#2b1d10]" />
            <button onClick={() => copy(ROOM.inviteLink)} className={BTN_INK}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <button className={`${BTN_BRASS} w-full !py-3 !text-[19px]`}>Start match</button>
        <p className={`text-center text-[14px] italic ${INK_SOFT} -mt-1`}>{notReady === 0 ? "Everyone is ready" : `${notReady} captain${notReady === 1 ? "" : "s"} not ready yet`}</p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className={`text-[15px] ${INK_SOFT} mb-1`}>{label}</div>
      {children}
    </div>
  );
}
