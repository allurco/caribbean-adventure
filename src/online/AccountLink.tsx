import { playPath } from "./shellRoute";
import { BTN_BRASS } from "./shellStyles";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";

/**
 * A small corner link over the local game back to the online shell (#125),
 * shown only when a backend is configured: "The harbour" once signed in, else
 * "Sign in".
 */
export function AccountLink({ config }: { config: SupabaseConfig }) {
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  if (session.status === "loading") return null;
  return (
    <a href={playPath()} className={`${BTN_BRASS} fixed top-[70px] right-4 z-40 px-3! py-1.5! text-[14px]!`}>
      {session.status === "signedIn" ? "The harbour" : "Sign in"}
    </a>
  );
}
