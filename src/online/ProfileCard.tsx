import type { Profile } from "./accountService";
import { CaptainSeal } from "./CaptainSeal";

/**
 * A player's public face: avatar when the sign-in provider gave one (#106),
 * else their wax seal (#125); and their display name.
 */
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-4">
      <CaptainSeal id={profile.id} displayName={profile.displayName} avatarUrl={profile.avatarUrl} size="lg" />
      <p className="min-w-0 font-fell text-[26px] leading-tight break-words">{profile.displayName}</p>
    </div>
  );
}
