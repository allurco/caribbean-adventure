import type { CaribbeanState, SettledRound } from "../game/types";
import { HUD_EDGE, HUD_TOP_BAR_HEIGHT } from "./hudLayout";
import { safeInset } from "./safeArea";
import { fightOverLines } from "./volleyText";
import { VolleyLines } from "./VolleyLines";

/**
 * The fight's end (#380): the round settles itself as its last volley
 * lands, so the volleys that ended the fight, and how it ended, stay on the
 * board here once the combat panel has gone, until closed.
 */
export function FightOverPanel({
  settled,
  G,
  npcLabel,
  onClose,
}: {
  settled: SettledRound;
  G: Pick<CaribbeanState, "ships" | "npcs">;
  /** What the fight called its NPC ("Merchant"), kept from the fight: a sunk NPC is gone from G. */
  npcLabel: string | null;
  onClose: () => void;
}) {
  // Seats count from 1 on the board, as everywhere else (#110)
  const nameOf = (id: string) => (settled.isNPCCombat && id === settled.defenderId ? `The ${(npcLabel ?? "NPC").toLowerCase()}` : `Player ${Number(id) + 1}`);
  const shooterLabel = (id: string) => (settled.isNPCCombat && id === settled.defenderId ? (npcLabel ?? "NPC") : `Player ${Number(id) + 1}`);
  const upgradesOf = (id: string): readonly string[] => G.ships[id]?.upgrades ?? [];
  const lines = fightOverLines(G, settled, nameOf);
  return (
    <div
      style={{ top: safeInset("top", HUD_TOP_BAR_HEIGHT + HUD_EDGE) }}
      className="absolute left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-red-800/50 bg-gradient-to-br from-stone-900/95 via-red-950/90 to-stone-950/95 shadow-2xl shadow-black/50 backdrop-blur-md text-white p-4 text-sm w-96 max-w-[calc(100vw-32px)]"
    >
      <div className="font-heading text-center text-red-400 uppercase text-sm tracking-wider mb-3 border-b border-red-800/30 pb-2">
        Fight over - Round {settled.round}
      </div>
      <div className="space-y-1 text-center">
        <VolleyLines volleys={settled.volleys} shooterLabel={shooterLabel} upgradesOf={upgradesOf} />
        {lines.map((line) => (
          <div key={line} className="font-heading text-amber-100 text-sm">
            {line}
          </div>
        ))}
      </div>
      <div className="text-center mt-3">
        <button
          onClick={onClose}
          className="font-heading py-2 px-4 rounded text-xs font-bold cursor-pointer transition-colors uppercase tracking-wider bg-amber-800/50 hover:bg-amber-700/50 text-amber-100 border border-amber-700/30"
        >
          Close
        </button>
      </div>
    </div>
  );
}
