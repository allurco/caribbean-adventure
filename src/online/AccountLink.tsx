import { ACCOUNT_LINK_Z, accountLinkPlacement } from "./accountLinkPlacement";
import { playPath } from "./shellRoute";
import { BTN_BRASS } from "./shellStyles";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";
import { useShellLayout } from "./useShellLayout";

/**
 * A small corner link over the local game back to the online shell (#125),
 * shown only when a backend is configured: "The harbour" once signed in, else
 * "Sign in". It stays above the captain draft, and on a phone held sideways
 * it is a full tap target clear of the port panel (`accountLinkPlacement`).
 */
export function AccountLink({ config }: { config: SupabaseConfig }) {
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  const { layout } = useShellLayout();
  if (session.status === "loading") return null;
  const { top, right, minHeight } = accountLinkPlacement(layout);
  return (
    <a
      href={playPath()}
      className={`${BTN_BRASS} fixed px-3! py-1.5! text-[14px]!`}
      style={{ top, right, minHeight, zIndex: ACCOUNT_LINK_Z }}
    >
      {session.status === "signedIn" ? "The harbour" : "Sign in"}
    </a>
  );
}
