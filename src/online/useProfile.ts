import { useEffect, useState } from "react";
import type { AccountClient } from "./accountClient";
import { fetchProfile, type Profile } from "./accountService";

export type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; error: string }
  | { status: "ready"; profile: Profile };

/**
 * One player's public profile, fetched when the client and id are known,
 * with a setter for after the player edits their own. The state remembers
 * which id it belongs to, so a new id reads as loading until it lands.
 */
export function useProfile(
  client: AccountClient | undefined,
  id: string | null,
): [ProfileState, (profile: Profile) => void] {
  const [loaded, setLoaded] = useState<{ id: string; state: ProfileState }>();
  useEffect(() => {
    if (!client || id === null) return;
    let live = true;
    void fetchProfile(client, id).then((result) => {
      if (!live) return;
      const state: ProfileState = !result.ok
        ? { status: "error", error: result.error }
        : result.profile
          ? { status: "ready", profile: result.profile }
          : { status: "missing" };
      setLoaded({ id, state });
    });
    return () => {
      live = false;
    };
  }, [client, id]);

  const state: ProfileState =
    id === null ? { status: "missing" } : loaded?.id === id ? loaded.state : { status: "loading" };
  return [state, (profile) => setLoaded({ id: profile.id, state: { status: "ready", profile } })];
}
