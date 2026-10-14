import type { ReactNode } from "react";
import type { AccountClient } from "./accountClient";
import type { AccountSession } from "./accountService";
import { OnlineSheet } from "./OnlineSheet";
import { SignInForm } from "./SignInForm";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";

interface SignInGateProps {
  config: SupabaseConfig;
  /** What a signed-in player sees. */
  children: (client: AccountClient, session: AccountSession) => ReactNode;
  /** Whether the sheets link back to the game; off where the gate stands in front of it. */
  backLink?: boolean;
}

/** The sign-in form until a player is signed in, then `children`. */
export function SignInGate({ config, children, backLink = true }: SignInGateProps) {
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  if (!client || session.status === "loading") {
    return (
      <OnlineSheet title="Your captain" backLink={backLink}>
        <p role="status">Reading the ship's log…</p>
      </OnlineSheet>
    );
  }
  if (session.status === "signedOut") {
    return (
      <OnlineSheet title="Sign in to sail" subtitle="Your matches wait for you on any device." backLink={backLink}>
        <SignInForm client={client} />
      </OnlineSheet>
    );
  }
  return children(client, session.session);
}
