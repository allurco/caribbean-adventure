/**
 * PROTOTYPE (throwaway, branch proto/combat-ui): three radically different
 * combat UIs for PRD #259 (with #256, #257, #258), switchable on one route.
 *
 *   ?view=combatproto&variant=A|B|C&step=1..5&seat=waiting|bystander
 *
 * A: the card table. B: the cinematic letterbox. C: the captain's logbook.
 * Fake state only (fakeCombat.ts); no engine, no moves. Dev builds only.
 * Keys: ← → switch variant, 1–5 or [ ] walk the steps, S swaps the seat on step 5.
 */
import { useCallback, useEffect, useState } from "react";
import { useShellFonts } from "../../online/useShellFonts";
import type { Seat, Step } from "./fakeCombat";
import { STEPS } from "./fakeCombat";
import { VariantCardTable } from "./VariantCardTable";
import { VariantCinematic } from "./VariantCinematic";
import { VariantLogbook } from "./VariantLogbook";

const VARIANTS = [
  { key: "A", name: "Card table" },
  { key: "B", name: "Cinematic" },
  { key: "C", name: "Captain's log" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

interface ProtoState {
  variant: VariantKey;
  step: Step;
  seat: Seat;
}

function readState(): ProtoState {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("variant");
  const s = Number(p.get("step"));
  return {
    variant: v === "B" || v === "C" ? v : "A",
    step: s >= 1 && s <= 5 ? (s as Step) : 1,
    seat: p.get("seat") === "bystander" ? "bystander" : "waiting",
  };
}

function writeState(state: ProtoState) {
  const p = new URLSearchParams(window.location.search);
  p.set("variant", state.variant);
  p.set("step", String(state.step));
  p.set("seat", state.seat);
  window.history.replaceState(null, "", `?${p.toString()}`);
}

export default function CombatProto() {
  useShellFonts();
  const [state, setState] = useState<ProtoState>(readState);
  const update = useCallback((patch: Partial<ProtoState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeState(next);
      return next;
    });
  }, []);

  const cycleVariant = useCallback(
    (dir: 1 | -1) => {
      const i = VARIANTS.findIndex((v) => v.key === state.variant);
      update({ variant: VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length].key });
    },
    [state.variant, update],
  );
  const stepBy = useCallback(
    (dir: 1 | -1) => update({ step: (((state.step - 1 + dir + 5) % 5) + 1) as Step }),
    [state.step, update],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") cycleVariant(-1);
      else if (e.key === "ArrowRight") cycleVariant(1);
      else if (e.key === "[") stepBy(-1);
      else if (e.key === "]") stepBy(1);
      else if (/^[1-5]$/.test(e.key)) update({ step: Number(e.key) as Step });
      else if (e.key === "s" || e.key === "S") update({ seat: state.seat === "waiting" ? "bystander" : "waiting" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleVariant, stepBy, update, state.seat]);

  const variant = VARIANTS.find((v) => v.key === state.variant) ?? VARIANTS[0];
  const goTo = (step: Step) => update({ step });

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b2530]">
      {state.variant === "A" && <VariantCardTable step={state.step} seat={state.seat} goTo={goTo} />}
      {state.variant === "B" && <VariantCinematic step={state.step} seat={state.seat} goTo={goTo} />}
      {state.variant === "C" && <VariantLogbook step={state.step} seat={state.seat} goTo={goTo} />}

      {/* The prototype's own controls: deliberately not part of any design. */}
      <div
        data-proto-bar
        className="fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/85 px-2 py-1 font-body text-[12px] text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] ring-1 ring-white/20"
      >
        <button className="rounded-full px-2 py-1 hover:bg-white/15" onClick={() => cycleVariant(-1)} aria-label="Previous variant">
          ‹
        </button>
        <span className="min-w-36 text-center font-semibold">
          {variant.key} ({variant.name})
        </span>
        <button className="rounded-full px-2 py-1 hover:bg-white/15" onClick={() => cycleVariant(1)} aria-label="Next variant">
          ›
        </button>
        <span className="mx-1 h-4 w-px bg-white/30" />
        {STEPS.map(({ step, name }) => (
          <button
            key={step}
            onClick={() => goTo(step)}
            title={name}
            className={`rounded-full px-2 py-1 ${state.step === step ? "bg-white text-black" : "hover:bg-white/15"}`}
          >
            {step} {state.step === step ? name : ""}
          </button>
        ))}
        {state.step === 5 && (
          <>
            <span className="mx-1 h-4 w-px bg-white/30" />
            {(["waiting", "bystander"] as const).map((seat) => (
              <button
                key={seat}
                onClick={() => update({ seat })}
                className={`rounded-full px-2 py-1 ${state.seat === seat ? "bg-amber-300 text-black" : "hover:bg-white/15"}`}
              >
                {seat === "waiting" ? "Ordered, waiting" : "Bystander"}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
