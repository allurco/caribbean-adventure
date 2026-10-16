import type { ReactNode } from "react";
import type { AccountClient } from "./accountClient";
import type { AccountSession } from "./accountService";
import { HarbourBackdrop } from "./HarbourBackdrop";
import { ShellSignIn } from "./ShellSignIn";
import { ShellStatus } from "./ShellStatus";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";
import { useShellFonts } from "./useShellFonts";

interface SignInGateProps {
  config: SupabaseConfig;
  /** What a signed-in player sees. */
  children: (client: AccountClient, session: AccountSession) => ReactNode;
}

/** The shell's sign-in screen (#125) until a player is signed in, then `children`: for pages outside the shell, such as the match board. */
export function SignInGate({ config, children }: SignInGateProps) {
  useShellFonts();
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  if (client && session.status === "signedIn") return children(client, session.session);
  const signingIn = client !== undefined && session.status === "signedOut";
  return (
    <div className="absolute inset-0 overflow-hidden bg-shell-harbour">
      <HarbourBackdrop interactive={signingIn} />
      {signingIn ? <ShellSignIn client={client} /> : <ShellStatus />}
    </div>
  );
}
