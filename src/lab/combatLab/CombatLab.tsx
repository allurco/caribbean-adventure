import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { SHIP_CLASSES, type ShipClass } from "../../game/types";
import { CAMERA_FOV } from "../../board/cameraBounds";
import { SHADOW_MAP_TYPE } from "../../board/visuals/atmosphere";
import { BEATS, BEAT_IDS } from "./beatTiming";
import type { Director } from "./combatDirector";
import { parseLabParams, type LabParams } from "./labSetup";
import { CombatLabScene } from "./CombatLabScene";

/**
 * PROTOTYPE: the combat animation lab (`?view=combatlab`, PRD #259). Two real
 * ship models on the real sea under the game's light, and a button for each
 * beat of a fight. Throwaway: it answers how the beats should look and time;
 * the pure modules beside it (shipPaths, broadside, beatTiming,
 * particlePool, mastSplit) are what a real slice would lift.
 *
 * URL: `a`, `b` (ship classes), `gap` (1 or 2 hexes), `actor` (a or b: who
 * fires, rakes, closes and bears away; the other takes the hits), `seed` (the
 * map), `play` (beats to play in turn, comma separated, e.g.
 * `play=declare,broadsideHigh`).
 */
export default function CombatLab() {
  const [params, setParams] = useState<LabParams>(() => parseLabParams(window.location.search));
  const [director, setDirector] = useState<Director | null>(null);
  const [status, setStatus] = useState("loading…");

  // Keep the URL in step with the choices, so a view can be shared and reloaded.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "combatlab");
    url.searchParams.set("a", params.a);
    url.searchParams.set("b", params.b);
    url.searchParams.set("gap", String(params.gap));
    url.searchParams.set("actor", params.actor);
    window.history.replaceState(null, "", url);
  }, [params]);

  useEffect(() => {
    if (!director) return;
    const timer = window.setInterval(() => setStatus(director.status()), 250);
    return () => window.clearInterval(timer);
  }, [director]);

  const onDirector = useCallback((d: Director) => setDirector(d), []);
  const set = <K extends keyof LabParams>(key: K, value: LabParams[K]) => setParams((p) => ({ ...p, [key]: value, play: [] }));

  return (
    <div className="relative h-screen w-screen bg-[#0a1929] font-body">
      <Canvas shadows={{ type: SHADOW_MAP_TYPE }} camera={{ fov: CAMERA_FOV, near: 0.1, far: 1000, position: [0, 5, 5] }}>
        <CombatLabScene params={params} onDirector={onDirector} />
      </Canvas>

      <div className="absolute left-3 top-3 flex max-w-[calc(100vw-24px)] flex-col gap-2 rounded-lg bg-black/55 p-3 text-xs text-white/90 backdrop-blur sm:w-64">
        <div className="font-semibold text-white">Combat animation lab · prototype (#259)</div>
        <div className="grid grid-cols-2 gap-2">
          <ClassPicker label="Ship A (blue)" value={params.a} onChange={(v) => set("a", v)} />
          <ClassPicker label="Ship B (red)" value={params.b} onChange={(v) => set("b", v)} />
          <label className="flex flex-col gap-1">
            Apart
            <select className="rounded bg-white/10 px-1 py-0.5" value={params.gap} onChange={(e) => set("gap", e.target.value === "2" ? 2 : 1)}>
              <option value={1}>1 hex</option>
              <option value={2}>2 hexes</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Acting
            <select className="rounded bg-white/10 px-1 py-0.5" value={params.actor} onChange={(e) => set("actor", e.target.value === "b" ? "b" : "a")}>
              <option value="a">A acts, B is hit</option>
              <option value="b">B acts, A is hit</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {BEAT_IDS.map((id) => (
            <button
              key={id}
              data-beat={id}
              className="rounded bg-amber-200/90 px-2 py-1.5 text-left font-semibold text-stone-900 hover:bg-amber-100 disabled:opacity-40"
              disabled={!director}
              onClick={() => director?.play(id)}
            >
              {BEATS[id].label}
            </button>
          ))}
          <button data-beat="reset" className="rounded bg-white/20 px-2 py-1.5 font-semibold hover:bg-white/30" disabled={!director} onClick={() => director?.reset()}>
            Reset
          </button>
        </div>
        <pre className="whitespace-pre-wrap text-[10px] leading-snug text-white/70" data-testid="lab-status">
          {status}
        </pre>
      </div>
    </div>
  );
}

function ClassPicker({ label, value, onChange }: { label: string; value: ShipClass; onChange: (v: ShipClass) => void }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select className="rounded bg-white/10 px-1 py-0.5" value={value} onChange={(e) => onChange(e.target.value as ShipClass)}>
        {SHIP_CLASSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
