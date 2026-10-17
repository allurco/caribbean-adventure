import { useEffect, useState } from "react";
import type { AccountClient } from "./accountClient";
import { watchSession, type AccountSession, type AuthEvent } from "./accountService";
import { getAccountClient } from "./supabaseClient";
import type { SupabaseConfig } from "./supabaseConfig";

/** The page's Supabase client once loaded; undefined until then. */
export function useAccountClient(config: SupabaseConfig): AccountClient | undefined {
  const [client, setClient] = useState<AccountClient>();
  useEffect(() => {
    let live = true;
    void getAccountClient(config).then((ready) => {
      if (live) setClient(ready);
    });
    return () => {
      live = false;
    };
  }, [config]);
  return client;
}

/** `event`: the supabase-js auth event that brought this state (#280), null for the first read. */
export type SessionState =
  | { status: "loading" }
  | { status: "signedOut"; event?: AuthEvent }
  | { status: "signedIn"; session: AccountSession; event?: AuthEvent };

/** Who is signed in, kept current across sign-ins and sign-outs. */
export function useAccountSession(client: AccountClient | undefined): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    return watchSession(client, (session, event) =>
      setState(session ? { status: "signedIn", session, event } : { status: "signedOut", event }),
    );
  }, [client]);
  return state;
}
