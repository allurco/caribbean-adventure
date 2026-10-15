import type { Profile } from "./accountService";
import { CaptainSeal } from "./CaptainSeal";
import { playPath } from "./shellRoute";
import { FOCUS_RING } from "./shellStyles";

/** The foot of the desktop nav board (#125): the captain's seal and name, or a way to sign in when signed out. */
export function CaptainFooter({ captain }: { captain: Profile | null }) {
  const box = "flex items-center gap-3 border-t border-shell-tar/80 bg-black/20 px-4 py-4 font-garamond";
  if (!captain) {
    return (
      <div className={box}>
        <a href={playPath()} className={`${FOCUS_RING} text-[16px] text-shell-timber-text underline decoration-shell-brass underline-offset-2`}>
          Sign in to sail
        </a>
      </div>
    );
  }
  return (
    <div className={box}>
      <CaptainSeal id={captain.id} displayName={captain.displayName} avatarUrl={captain.avatarUrl} />
      <span className="min-w-0 truncate text-[16px] leading-tight text-shell-timber-text">{captain.displayName || "…"}</span>
    </div>
  );
}
