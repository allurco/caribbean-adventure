import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Group } from "three";
import type { ShipState, NPCShip, GoodType } from "../game/types";
import { GOOD_TYPES } from "../game/types";
import { NationFlag } from "./NationFlag";
import { shipTooltipHeight } from "./shipHull";
import { ndcToScreen, placementOffset, placeShipTooltip } from "./shipTooltipPlacement";
import { useSafeAreaInsets } from "./useSafeAreaInsets";

const masthead = new Vector3();
const waterline = new Vector3();

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

  // Drawn at the waterline and moved each frame to where shipTooltipPlacement
  // puts it: over the masthead (ADR 0006), so it never covers the ship, or
  // under the hull when the HUD's top bar is in the way (#199). Hidden until
  // its first placement.
  const anchorRef = useRef<Group>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mastheadHeight = shipTooltipHeight(ship.shipClass);
  // Clear of a notch and the rounded corners (#123), as the HUD is
  const insets = useSafeAreaInsets();
  useFrame(({ camera, size }) => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    anchor.localToWorld(waterline.set(position[0], position[1], position[2])).project(camera);
    anchor.localToWorld(masthead.set(position[0], position[1] + mastheadHeight, position[2])).project(camera);
    const atWaterline = ndcToScreen(waterline, size);
    const placement = placeShipTooltip({
      masthead: ndcToScreen(masthead, size),
      waterline: atWaterline,
      tooltip: { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      viewport: size,
      insets,
    });
    const offset = placementOffset(placement, atWaterline);
    tooltip.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    tooltip.style.visibility = "visible";
  });

  return (
    <group ref={anchorRef}>
    <Html position={position}>
      <div
        ref={tooltipRef}
        style={{ visibility: "hidden" }}
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
    </group>
  );
}
