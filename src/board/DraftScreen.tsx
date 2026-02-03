import { useState } from "react";
import type { Captain, CaribbeanState, ShipClass } from "../game/types";
import { STARTER_SHIP_CLASSES } from "../game/types";
import { SHIP_SPECS } from "../game/constants";
import { NationFlag } from "./NationFlag";

interface DraftScreenProps {
  G: CaribbeanState;
  currentPlayer: string;
  onPickCaptain: (index: number, shipClass: ShipClass) => void;
}

function CaptainCard({
  captain,
  onSelect,
}: {
  captain: Captain;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group w-72 rounded-xl overflow-hidden text-left cursor-pointer transition-all duration-200 border border-amber-700/30 hover:border-amber-500/60 bg-gradient-to-b from-stone-900/95 to-amber-950/90 hover:from-stone-900 hover:to-amber-950 shadow-lg hover:shadow-amber-900/30 hover:scale-[1.03] backdrop-blur-sm"
    >
      <div className="p-5">
        <h3 className="font-heading text-lg font-bold text-amber-100 mb-2 leading-tight">
          {captain.name}
        </h3>

        <div className="flex items-center gap-2 mb-4">
          <NationFlag nation={captain.nation} size="lg" />
          <span className="text-amber-300/70 text-xs font-medium tracking-wide">
            {captain.nation}
          </span>
        </div>

        <div className="border-t border-amber-700/20 pt-3">
          <div className="text-[10px] text-amber-500/50 uppercase tracking-wider font-semibold mb-1">
            Special Ability
          </div>
          <p className="text-sm text-amber-200/60 italic leading-relaxed">
            {captain.ability}
          </p>
        </div>
      </div>
    </button>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-amber-300/50 text-xs">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          accent ? "text-amber-200" : "text-amber-100/80"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ShipClassCard({
  shipClass,
  onSelect,
}: {
  shipClass: ShipClass;
  onSelect: () => void;
}) {
  const stats = SHIP_SPECS[shipClass];
  return (
    <button
      onClick={onSelect}
      className="group w-72 rounded-xl overflow-hidden text-left cursor-pointer transition-all duration-200 border border-amber-700/30 hover:border-amber-500/60 bg-gradient-to-b from-stone-900/95 to-amber-950/90 hover:from-stone-900 hover:to-amber-950 shadow-lg hover:shadow-amber-900/30 hover:scale-[1.03] backdrop-blur-sm"
    >
      {/* Accent bar */}
      <div className="h-1.5 w-full bg-amber-700/50" />

      <div className="p-5">
        <h3 className="font-heading text-lg font-bold text-amber-100 mb-4 tracking-wide">
          {shipClass}
        </h3>

        <div className="space-y-2">
          <StatRow label="Speed" value={`${stats.maneuverability} moves`} accent />
          <StatRow label="Cargo" value={`${stats.cargo} slots`} />

          <div className="border-t border-amber-700/20 my-1" />

          <StatRow label="Cannons" value={stats.cannons} />
          <StatRow label="Hull" value={stats.hull.max} />
          <StatRow label="Crew" value={stats.crew.max} />
          <StatRow label="Scouting" value={stats.scouting} />
        </div>
      </div>
    </button>
  );
}

export function DraftScreen({
  G,
  currentPlayer,
  onPickCaptain,
}: DraftScreenProps) {
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [selectedCaptainIndex, setSelectedCaptainIndex] = useState<
    number | null
  >(null);
  const hand = G.draftHands[currentPlayer] ?? [];

  // Interstitial: pass the device
  if (showInterstitial) {
    return (
      <div className="w-screen h-screen bg-[#0a0e17] flex flex-col items-center justify-center font-body">
        <div className="rounded-xl border border-amber-700/30 bg-gradient-to-b from-stone-900/95 to-amber-950/90 backdrop-blur-sm p-12 text-center max-w-md shadow-2xl shadow-black/50">
          <h2 className="font-heading text-2xl font-bold text-amber-100 mb-3 tracking-wide">
            Pass the Helm
          </h2>
          <p className="text-amber-300/50 text-sm mb-8 leading-relaxed">
            Hand the device to <span className="text-amber-200 font-semibold">Player {currentPlayer}</span>.<br />
            No peeking at the next captain's hand!
          </p>
          <button
            onClick={() => {
              setShowInterstitial(false);
              setSelectedCaptainIndex(null);
            }}
            className="font-heading px-8 py-3 bg-amber-800/60 hover:bg-amber-700/80 border border-amber-600/40 hover:border-amber-500/60 text-amber-100 text-sm font-bold rounded-lg uppercase tracking-widest cursor-pointer transition-all shadow-lg"
          >
            I'm Ready
          </button>
        </div>
      </div>
    );
  }

  // Waiting
  if (hand.length === 0) {
    return (
      <div className="w-screen h-screen bg-[#0a0e17] flex items-center justify-center font-body">
        <div className="text-center">
          <div className="font-heading text-amber-500/40 text-sm uppercase tracking-[0.3em] mb-3">
            Awaiting Orders
          </div>
          <div className="text-amber-200/50 text-lg italic">
            Waiting for other players...
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Ship class selection
  if (selectedCaptainIndex !== null) {
    const chosenCaptain = hand[selectedCaptainIndex];
    return (
      <div className="w-screen h-screen bg-[#0a0e17] flex flex-col items-center justify-center font-body">
        <div className="max-w-2xl w-full px-6">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-heading text-3xl font-bold text-amber-100 tracking-wide mb-2">
              Choose Your Ship
            </h1>
            <div className="flex items-center justify-center gap-3 mb-1">
              <div className="h-px flex-1 max-w-16 bg-gradient-to-r from-transparent to-amber-700/40" />
              <span className="text-amber-500/50 text-xs uppercase tracking-[0.2em] font-medium">
                Player {currentPlayer}
              </span>
              <div className="h-px flex-1 max-w-16 bg-gradient-to-l from-transparent to-amber-700/40" />
            </div>
            <p className="text-amber-400/40 text-sm">
              Captain <span className="text-amber-300/60 font-medium">{chosenCaptain.name}</span>
              <span className="mx-1.5 text-amber-600/30">/</span>
              <span className="text-amber-400/50">{chosenCaptain.nation}</span>
            </p>
          </div>

          {/* Ship cards */}
          <div className="flex gap-6 justify-center">
            {STARTER_SHIP_CLASSES.map((cls) => (
              <ShipClassCard
                key={cls}
                shipClass={cls}
                onSelect={() => {
                  onPickCaptain(selectedCaptainIndex, cls);
                  setShowInterstitial(true);
                }}
              />
            ))}
          </div>

          {/* Back link */}
          <div className="mt-8 text-center">
            <button
              onClick={() => setSelectedCaptainIndex(null)}
              className="text-amber-600/50 hover:text-amber-400/70 text-xs uppercase tracking-wider cursor-pointer transition-colors font-medium"
            >
              Back to captain selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Captain selection
  return (
    <div className="w-screen h-screen bg-[#0a0e17] flex flex-col items-center justify-center font-body">
      <div className="max-w-2xl w-full px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl font-bold text-amber-100 tracking-wide mb-2">
            Choose Your Captain
          </h1>
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 max-w-16 bg-gradient-to-r from-transparent to-amber-700/40" />
            <span className="text-amber-500/50 text-xs uppercase tracking-[0.2em] font-medium">
              Player {currentPlayer}
            </span>
            <div className="h-px flex-1 max-w-16 bg-gradient-to-l from-transparent to-amber-700/40" />
          </div>
        </div>

        {/* Captain cards */}
        <div className="flex gap-6 justify-center">
          {hand.map((captain, index) => (
            <CaptainCard
              key={captain.id}
              captain={captain}
              onSelect={() => setSelectedCaptainIndex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
