import { useCallback, useEffect, useRef, useState } from "react";
import type { CaribbeanState, ShipClass } from "../../game/types";
import { audioEngine } from "../../audio/sharedAudioEngine";
import { worldSeedOf } from "../visuals/subSeed";
import { createCombatDirector, type CombatDirector } from "./combatDirector";
import { combatBeatsFrom } from "./combatTimeline";
import { combatShipPoses } from "./combatShipPoses";
import { departedShips, type DepartedShip } from "./departedShips";

/** A departed ship as the board draws it, under a key of its own: a seat's id can sink, come back (#277) and sink again. */
export interface DepartedShipView extends DepartedShip {
  key: string;
}

export interface CombatFx {
  director: CombatDirector;
  /** Ships that left `G` the fight still shows (sinking, or a prize alongside). */
  departed: DepartedShipView[];
  /** A departed ship (by its key) is done. */
  finishDeparted: (key: string) => void;
  /** A word over the fight (escaped, caught), or null. */
  banner: string | null;
}

/**
 * The fight on the board (#263): each change of `G` becomes the combat
 * timeline's beats, played by one director for the effects and the sounds
 * (positional, at the ship), on every seat alike.
 */
export function useCombatFx(G: CaribbeanState, reducedMotion: boolean): CombatFx {
  const [banner, setBanner] = useState<string | null>(null);
  const [director] = useState(() =>
    createCombatDirector({
      poses: combatShipPoses,
      seed: worldSeedOf(G),
      playSound: (id, at) => void audioEngine.play(id, { at }),
      onBanner: setBanner,
    })
  );
  const [departed, setDeparted] = useState<DepartedShipView[]>([]);
  const departures = useRef(0);
  const prev = useRef<CaribbeanState | undefined>(undefined);

  useEffect(() => {
    director.setReducedMotion(reducedMotion);
  }, [director, reducedMotion]);

  useEffect(() => {
    const before = prev.current;
    prev.current = G;
    director.setFightOn(G.combat !== undefined);
    const beats = combatBeatsFrom(before, G, { reducedMotion });
    if (!before || beats.length === 0) return;
    const classes: Record<string, ShipClass | undefined> = {};
    for (const state of [before, G]) {
      for (const [id, ship] of Object.entries(state.ships)) classes[id] = ship.shipClass;
      for (const [id, npc] of Object.entries(state.npcs)) classes[id] = npc.shipClass;
    }
    director.enqueue(beats, classes);
    const gone = departedShips(before, G, beats, (id) => combatShipPoses.reported(id)?.heading ?? 0);
    if (gone.length > 0) {
      const views = gone.map((g) => ({ ...g, key: `${g.id}#${++departures.current}` }));
      setDeparted((list) => [...list.filter((d) => !gone.some((g) => g.id === d.id)), ...views]);
    }
  }, [G, director, reducedMotion]);

  const finishDeparted = useCallback((key: string) => setDeparted((list) => list.filter((d) => d.key !== key)), []);
  return { director, departed, finishDeparted, banner };
}
