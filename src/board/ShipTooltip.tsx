import { Html } from "@react-three/drei";
import type { ShipState, NPCShip, GoodType } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { NationFlag } from "./NationFlag";

interface ShipTooltipProps {
  position: [number, number, number];
  ship: ShipState | NPCShip;
  isNPC: boolean;
  isPlayer?: boolean;
  playerIndex?: string;
  isScouted?: boolean;
  canScout?: boolean;
}

function CargoDisplay({ cargo, gold }: { cargo: Record<GoodType, number>; gold: number }) {
  const hasAnyCargo = GOOD_TYPES.some((g) => cargo[g] > 0);

  return (
    <div className="mt-1 pt-1 border-t border-amber-800/20">
      <div className="text-amber-400/60 text-[10px] uppercase mb-0.5">Cargo (est.)</div>
      {hasAnyCargo ? (
        <div className="grid grid-cols-2 gap-x-2 text-[10px]">
          {GOOD_TYPES.map((g) =>
            cargo[g] > 0 ? (
              <div key={g} className="text-amber-200/80">
                {g}: ~{cargo[g]}
              </div>
            ) : null
          )}
        </div>
      ) : (
        <div className="text-amber-200/50 text-[10px]">Empty hold</div>
      )}
      <div className="text-yellow-400/70 text-[10px] mt-0.5">
        Gold: ~{gold}
      </div>
    </div>
  );
}

export function ShipTooltip({
  position,
  ship,
  isNPC,
  isPlayer,
  playerIndex,
  isScouted,
  canScout,
}: ShipTooltipProps) {
  const npc = ship as NPCShip;
  const playerShip = ship as ShipState;

  const getShipLabel = () => {
    if (isPlayer) return "Your Ship";
    if (isNPC) {
      if (npc.isIdentified) {
        return npc.role === "FLOTILLA" ? "Warship" : "Merchant";
      }
      return "Unknown Vessel";
    }
    return `Player ${Number(playerIndex) + 1}`;
  };

  // Show cargo if scouted (for players) or identified (for NPCs)
  const showCargo = isNPC ? npc.isIdentified : isScouted;

  return (
    <Html position={[position[0], position[1] + 1.2, position[2]]} center>
      <div
        className="bg-stone-900/95 text-amber-100 px-3 py-2 rounded-lg
                      text-xs shadow-lg border border-amber-800/30
                      whitespace-nowrap pointer-events-none"
      >
        {/* Ship class and role */}
        <div
          className={`font-heading uppercase tracking-wider ${
            isNPC && npc.isIdentified && npc.role === "FLOTILLA"
              ? "text-red-400"
              : "text-amber-400"
          }`}
        >
          {getShipLabel()}
          {ship.shipClass && (isNPC ? npc.isIdentified : true) && ` - ${ship.shipClass}`}
        </div>

        {/* Nation for identified NPCs */}
        {isNPC && npc.isIdentified && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <NationFlag nation={npc.nation} size="sm" />
            <span className="text-amber-300/70">{npc.nation}</span>
          </div>
        )}

        {/* Health bars */}
        <div className="mt-1 space-y-0.5">
          <div>
            Hull: {ship.stats?.hull.current}/{ship.stats?.hull.max}
          </div>
          <div>
            Crew: {ship.stats?.crew.current}/{ship.stats?.crew.max}
          </div>
        </div>

        {/* Cargo info for scouted/identified ships */}
        {showCargo && (
          <CargoDisplay
            cargo={isNPC ? npc.cargo : playerShip.cargo}
            gold={isNPC ? npc.gold : playerShip.gold}
          />
        )}

        {/* Spyglass hint for unscouted ships */}
        {!isPlayer && !showCargo && canScout && (
          <div className="mt-1 text-cyan-400/60 text-[10px]">
            Use Spyglass to reveal cargo
          </div>
        )}

        {/* Click hint for player ship */}
        {isPlayer && (
          <div className="mt-1 text-amber-400/60 text-[10px]">
            Click for details
          </div>
        )}
      </div>
    </Html>
  );
}
