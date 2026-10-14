import { OnlineSheet } from "./OnlineSheet";
import { ProfileCard } from "./ProfileCard";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient } from "./useAccount";
import { useProfile } from "./useProfile";

/** `?view=profile&id=…`: anyone's public profile, signed in or not. */
export function ProfilePage({ config, id }: { config: SupabaseConfig; id: string | null }) {
  const client = useAccountClient(config);
  const [profile] = useProfile(client, id);
  return (
    <OnlineSheet title="Captain's profile">
      {profile.status === "loading" && <p role="status">Reading the ship's log…</p>}
      {profile.status === "missing" && <p>No captain sails under that name.</p>}
      {profile.status === "error" && <p role="alert" className="text-shell-ink-wax">{profile.error}</p>}
      {profile.status === "ready" && <ProfileCard profile={profile.profile} />}
    </OnlineSheet>
  );
}
