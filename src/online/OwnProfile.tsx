import { useState } from "react";
import type { AccountClient } from "./accountClient";
import { profilePath } from "./accountRoute";
import { signOut, type AccountSession, type Profile } from "./accountService";
import { DisplayNameForm } from "./DisplayNameForm";
import { ProfileCard } from "./ProfileCard";
import { BTN_INK, LINK } from "./shellStyles";
import type { ProfileState } from "./useProfile";

interface OwnProfileProps {
  client: AccountClient;
  session: AccountSession;
  /** The captain's profile, held by the shell so a new name shows on the nav board at once. */
  profile: ProfileState;
  onSaved: (profile: Profile) => void;
}

/**
 * The signed-in player's page, the shell's Profile sheet (#105, #125): their
 * profile, the name editor, sign-out. Deleting the account (#108) joins the
 * sign-out row.
 */
export function OwnProfile({ client, session, profile, onSaved }: OwnProfileProps) {
  const [signOutError, setSignOutError] = useState<string>();

  return (
    <div className="space-y-5 text-[16px]">
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
          <DisplayNameForm key={profile.profile.id} client={client} profile={profile.profile} onSaved={onSaved} />
          <p>
            <a href={profilePath(session.userId)} className={LINK}>
              Your public profile
            </a>
          </p>
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-shell-rule/35 pt-4">
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
    </div>
  );
}
