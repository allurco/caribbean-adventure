import { useState } from "react";
import type { AccountClient } from "./accountClient";
import { profilePath } from "./accountRoute";
import { signOut, type AccountSession } from "./accountService";
import { DisplayNameForm } from "./DisplayNameForm";
import { OnlineSheet } from "./OnlineSheet";
import { ProfileCard } from "./ProfileCard";
import { BTN_INK, LINK } from "./shellStyles";
import { useProfile } from "./useProfile";

/** The signed-in player's page: their profile, the name editor, sign-out. */
export function OwnProfile({ client, session }: { client: AccountClient; session: AccountSession }) {
  const [profile, setProfile] = useProfile(client, session.userId);
  const [signOutError, setSignOutError] = useState<string>();

  return (
    <OnlineSheet title="Your captain">
      {profile.status === "loading" && <p role="status">Reading the ship's log…</p>}
      {profile.status === "missing" && <p>Your profile is not there yet. Reload in a moment.</p>}
      {profile.status === "error" && (
        <p role="alert" className="text-shell-ink-wax">
          {profile.error}
        </p>
      )}
      {profile.status === "ready" && (
        <>
          <ProfileCard profile={profile.profile} />
          <DisplayNameForm key={profile.profile.id} client={client} profile={profile.profile} onSaved={setProfile} />
          <p>
            <a href={profilePath(session.userId)} className={LINK}>
              Your public profile
            </a>
          </p>
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[#7a5c3a]/35 pt-4">
        <span className="min-w-0 truncate text-[15px] text-shell-ink-soft">{session.email ?? ""}</span>
        <button
          type="button"
          onClick={async () => {
            const result = await signOut(client);
            setSignOutError(result.ok ? undefined : result.error);
          }}
          className={`${BTN_INK} shrink-0`}
        >
          Sign out
        </button>
      </div>
      {signOutError && (
        <p role="alert" className="text-shell-ink-wax">
          {signOutError}
        </p>
      )}
    </OnlineSheet>
  );
}
