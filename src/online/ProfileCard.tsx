import type { Profile } from "./accountService";

/**
 * A player's public face: avatar when the sign-in provider gave one (#106),
 * else a wax seal with their initial; and their display name.
 */
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-4">
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-black/30" />
      ) : (
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--color-shell-ink-wax),#1c0f08_140%)] font-fell-sc text-2xl text-amber-100/90 ring-2 ring-black/30 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.15)]"
        >
          {[...profile.displayName][0]?.toUpperCase()}
        </div>
      )}
      <p className="min-w-0 font-fell text-[26px] leading-tight break-words">{profile.displayName}</p>
    </div>
  );
}
