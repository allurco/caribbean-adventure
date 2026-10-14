import { accountPath } from "./accountRoute";
import { BTN_BRASS } from "./shellStyles";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";

/**
 * A small corner link over the hotseat game to the account page (#105),
 * shown only when a backend is configured: "Your captain" once signed in, or
 * "Sign in" when the game was opened with `?skipLogin=1`. The online entry point (#125) supersedes it.
 */
export function AccountLink({ config }: { config: SupabaseConfig }) {
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  if (session.status === "loading") return null;
  return (
    <a href={accountPath()} className={`${BTN_BRASS} fixed top-[70px] right-4 z-40 px-3! py-1.5! text-[14px]!`}>
      {session.status === "signedIn" ? "Your captain" : "Sign in"}
    </a>
  );
}
