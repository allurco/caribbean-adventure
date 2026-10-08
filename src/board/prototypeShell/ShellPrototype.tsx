import { useCallback, useEffect, useState } from "react";
import { readScreen, readVariant, VARIANTS, type Screen, type VariantKey } from "./shellKeys";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { VariantD } from "./VariantD";

/**
 * THROWAWAY PROTOTYPE for #104: "what should the out-of-game online shell
 * look like?" Three structurally different variants of the same six screens
 * on stub data. D merges B's structure with A's harbour.
 * `?view=prototype-shell&variant=A|B|C|D&screen=signin|home|room|lobby|party|queue`.
 * Delete once a direction is chosen.
 */
export function ShellPrototype() {
  const [variant, setVariant] = useState<VariantKey>(() => readVariant(window.location.search));
  const [screen, setScreen] = useState<Screen>(() => readScreen(window.location.search));

  // Keep the URL shareable and reload-stable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "prototype-shell");
    params.set("variant", variant);
    params.set("screen", screen);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [variant, screen]);

  const go = useCallback((s: Screen) => setScreen(s), []);
  const cycleVariant = useCallback((step: number) => {
    setVariant((v) => {
      const i = VARIANTS.findIndex((x) => x.key === v);
      return VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length].key;
    });
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden font-body">
      {variant === "A" && <VariantA screen={screen} go={go} />}
      {variant === "B" && <VariantB screen={screen} go={go} />}
      {variant === "C" && <VariantC screen={screen} go={go} />}
      {variant === "D" && <VariantD screen={screen} go={go} />}
      {import.meta.env.DEV && (
        <PrototypeSwitcher variant={variant} screen={screen} onCycleVariant={cycleVariant} onScreen={setScreen} />
      )}
    </div>
  );
}
