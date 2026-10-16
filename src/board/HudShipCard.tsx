import type { GoodType, ShipState } from "../game/types";
import { NationFlag } from "./NationFlag";
import { shipCardView, type ShipMeter } from "./hudShipCardView";

interface HudShipCardProps {
  ship: ShipState;
}

/** Fill of each meter, in ink; the track is the same ink, faint. */
const METER_INK: Record<string, { bar: string; track: string }> = {
  Hull: { bar: "bg-ink-red", track: "bg-ink-red/15" },
  Crew: { bar: "bg-ink-blue", track: "bg-ink-blue/15" },
};

/** A swatch beside each good's name in the hold; the name carries the meaning. */
const CARGO_SWATCH: Record<GoodType, string> = {
  Wood: "#7c4a12",
  Sugar: "#f8f4e6",
  Rum: "#b4410f",
  Spice: "#b91c1c",
};

function StatMeter({ meter }: { meter: ShipMeter }) {
  const ink = METER_INK[meter.label] ?? { bar: "bg-ink", track: "bg-ink/15" };
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-faded text-[11px] w-9 text-right shrink-0 font-semibold">
        {meter.label}
      </span>
      <div
        role="meter"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={meter.max}
        aria-valuenow={meter.current}
        aria-valuetext={`${meter.current} of ${meter.max}`}
        className={`flex-1 h-2 rounded-full overflow-hidden ring-1 ring-ink/20 ${ink.track}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${ink.bar}`}
          style={{ width: `${meter.percent}%` }}
        />
      </div>
      <span className="text-ink text-[11px] w-7 tabular-nums text-right shrink-0 font-medium" aria-hidden="true">
        {meter.current}/{meter.max}
      </span>
    </div>
  );
}

/** The ship's half of the parchment sheet (`HudParchmentPanel`), in ink. */
export function HudShipCard({ ship }: HudShipCardProps) {
  const view = shipCardView(ship);

  return (
    <div className="flex flex-col h-full">
      {/* Section label */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading text-[11px] font-bold text-ink-faded uppercase tracking-widest">
          {view.title}
        </h2>
      </div>

      <div className="flex-1 flex flex-col gap-2.5">
        {view.meters.length > 0 && (
          <div className="space-y-1.5">
            {view.meters.map((m) => (
              <StatMeter key={m.label} meter={m} />
            ))}
          </div>
        )}

        {view.damage.length > 0 && (
          <div className="flex items-center gap-2 border border-ink-red/50 rounded px-2 py-1">
            <span className="text-ink-red text-[11px] font-bold uppercase tracking-wide">
              Damaged
            </span>
            <div className="flex gap-2">
              {view.damage.map((d) => (
                <span key={d.label} className="text-ink-red text-[11px] font-medium">
                  {d.label} -{d.amount}
                </span>
              ))}
            </div>
          </div>
        )}

        {view.wanted.length > 0 && (
          <div className="flex items-center gap-2 border-2 border-ink-red/70 rounded px-2 py-1">
            <span className="text-ink-red text-[11px] font-bold uppercase tracking-wide">
              Wanted
            </span>
            <div className="flex gap-1.5">
              {view.wanted.map(({ nation, bounty }) => (
                <div
                  key={nation}
                  className="flex items-center gap-1"
                  title={`${nation}: ${bounty} bounty`}
                >
                  <NationFlag nation={nation} size="sm" />
                  <span className="text-ink-red text-[11px] font-semibold">
                    <span className="sr-only">{nation} bounty </span>
                    {bounty}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view.contract && (
          <p
            className="text-[11px] text-ink truncate"
            title={view.contract.failed ? `${view.contract.title} (failed)` : view.contract.title}
          >
            <span className="text-ink-faded font-semibold">Contract: </span>
            {view.contract.title}
            {view.contract.failed && <span className="text-ink-red font-semibold"> (failed)</span>}
          </p>
        )}

        {view.stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {view.stats.map((s) => (
              <div key={s.label} className="flex justify-between items-baseline">
                <dt className="text-ink-faded text-[11px]">{s.label}</dt>
                <dd className="text-ink text-xs font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(view.cargo.length > 0 || view.upgrades.length > 0) && (
          <div className="mt-auto pt-2 border-t border-ink/25 flex flex-wrap gap-1">
            {view.cargo.map(({ good, amount }) => (
              <span
                key={good}
                className="inline-flex items-center gap-1 rounded border border-ink/30 px-1.5 py-0.5 text-[11px] font-medium text-ink"
              >
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full ring-1 ring-ink/40"
                  style={{ backgroundColor: CARGO_SWATCH[good] }}
                />
                {good} {amount}
              </span>
            ))}
            {view.upgrades.map((name, i) => (
              <span
                key={`${i}-${name}`}
                className="inline-flex items-center rounded border border-ink-green/50 text-ink-green px-1.5 py-0.5 text-[11px] font-semibold"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
