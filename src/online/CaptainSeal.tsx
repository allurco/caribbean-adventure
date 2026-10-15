import { safeAvatarUrl } from "./avatarUrl";
import { sealFor } from "./seal";

const SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-10 w-10 text-[14px]",
  lg: "h-16 w-16 text-2xl",
} as const;

interface CaptainSealProps {
  id: string;
  displayName: string;
  /** The sign-in provider's avatar (#106), shown instead of the seal when it is a safe https URL. */
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
}

/** A captain's face in the shell (#125): their avatar, else a wax seal with their initials. Decorative: the name is always shown beside it. */
export function CaptainSeal({ id, displayName, avatarUrl = null, size = "md" }: CaptainSealProps) {
  // Checked again where it is rendered: an <img> takes nothing but https.
  const src = safeAvatarUrl(avatarUrl);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-2 ring-black/30`}
      />
    );
  }
  const seal = sealFor(id, displayName);
  return (
    <span
      aria-hidden="true"
      style={{ background: `radial-gradient(circle at 35% 30%, ${seal.wax}, #1c0f08 140%)` }}
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full font-fell-sc text-amber-100/90 ring-2 ring-black/30 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.15)]`}
    >
      {seal.initials}
    </span>
  );
}
