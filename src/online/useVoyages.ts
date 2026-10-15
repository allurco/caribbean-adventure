import { useEffect, useState } from "react";
import type { RoomApi } from "./roomApi";
import type { VoyageView } from "./voyageList";

export type VoyagesState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; voyages: VoyageView[] };

/** The signed-in player's voyages, read once when the harbour opens. */
export function useVoyages(api: Pick<RoomApi, "listVoyages">): VoyagesState {
  const [state, setState] = useState<VoyagesState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    void api.listVoyages().then((result) => {
      if (!live) return;
      setState(result.ok ? { status: "ready", voyages: result.voyages } : { status: "error", error: result.error });
    });
    return () => {
      live = false;
    };
  }, [api]);
  return state;
}
