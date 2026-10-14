import { OnlineSheet } from "./OnlineSheet";
import { OwnProfile } from "./OwnProfile";
import { SignInForm } from "./SignInForm";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";

/** `?view=account`: the sign-in form, or the signed-in player's own profile. */
export function AccountPage({ config }: { config: SupabaseConfig }) {
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  if (!client || session.status === "loading") {
    return (
      <OnlineSheet title="Your captain">
        <p role="status">Reading the ship's log…</p>
      </OnlineSheet>
    );
  }
  if (session.status === "signedOut") {
    return (
      <OnlineSheet title="Sign in to sail" subtitle="Your matches wait for you on any device.">
        <SignInForm client={client} />
      </OnlineSheet>
    );
  }
  return <OwnProfile client={client} session={session.session} />;
}
