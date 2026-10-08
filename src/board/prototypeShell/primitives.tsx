import type { Player, Presence } from "./fixtures";

/**
 * THROWAWAY PROTOTYPE: the only components the variants share, a wax-seal
 * avatar and a presence dot. No layout lives here (hooks: shellHooks.ts).
 */

const SEAL_SIZES = { sm: "w-7 h-7 text-[10px]", md: "w-10 h-10 text-xs", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" } as const;

export function Seal({ player, size = "md", className = "" }: { player: Pick<Player, "initials" | "seal">; size?: keyof typeof SEAL_SIZES; className?: string }) {
  return (
    <div
      className={`${SEAL_SIZES[size]} ${className} shrink-0 rounded-full flex items-center justify-center font-heading font-bold text-amber-100/90 ring-2 ring-black/30 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.45),inset_0_2px_3px_rgba(255,255,255,0.15)]`}
      style={{ background: `radial-gradient(circle at 35% 30%, ${player.seal}, #1c0f08 140%)` }}
    >
      {player.initials}
    </div>
  );
}

const DOT: Record<Presence, string> = {
  online: "bg-emerald-400",
  "in-match": "bg-sky-400",
  away: "bg-amber-400",
  offline: "bg-stone-500",
};

export function PresenceDot({ presence, className = "" }: { presence: Presence; className?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${DOT[presence]} ${className}`} />;
}
