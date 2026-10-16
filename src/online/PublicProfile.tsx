import type { AccountClient } from "./accountClient";
import { ProfileCard } from "./ProfileCard";
import { useProfile } from "./useProfile";

/** `?view=profile&id=…`: anyone's public profile, signed in or not, on the shell's sheet (#105, #125). */
export function PublicProfile({ client, id }: { client: AccountClient; id: string | null }) {
  const [profile] = useProfile(client, id);
  return (
    <div className="text-[16px]">
      {profile.status === "loading" && <p role="status">Reading the ship's log…</p>}
      {profile.status === "missing" && <p>No captain sails under that name.</p>}
      {profile.status === "error" && (
        <p role="alert" className="text-shell-ink-wax">
          {profile.error}
        </p>
      )}
      {profile.status === "ready" && <ProfileCard profile={profile.profile} />}
      {profile.status === "ready" && profile.profile.deleted && (
        <p className="mt-3 text-[15px] text-shell-ink-soft italic">This captain's account was deleted.</p>
      )}
    </div>
  );
}
