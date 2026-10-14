import { OwnProfile } from "./OwnProfile";
import { SignInGate } from "./SignInGate";
import type { SupabaseConfig } from "./supabaseConfig";

/** `?view=account`: the sign-in form, or the signed-in player's own profile. */
export function AccountPage({ config }: { config: SupabaseConfig }) {
  return <SignInGate config={config}>{(client, session) => <OwnProfile client={client} session={session} />}</SignInGate>;
}
