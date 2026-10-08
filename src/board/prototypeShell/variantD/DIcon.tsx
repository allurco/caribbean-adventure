/**
 * THROWAWAY PROTOTYPE: variant D's nav marks, drawn as engraved line icons
 * (unicode anchors render as colour emoji on some systems).
 */
export type DIconName = "anchor" | "board" | "crew" | "crown" | "compass" | "plus" | "seal";

const PATHS: Record<DIconName, string> = {
  anchor: "M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 4v14m-5-9h10M4 14c0 4 3.6 7 8 7s8-3 8-7m-16 0 2 1.5M20 14l-2 1.5",
  board: "M4 4h16v13H4zM8 17v4m8-4v4M7 8h6M7 11h10M7 14h8",
  crew: "M6 21V4m0 0h11l-2.5 3.5L17 11H6",
  crown: "M4 18h16M5 18 3.5 8l5 4L12 5l3.5 7 5-4L19 18",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  plus: "M12 5v14M5 12h14",
  seal: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-3 8h6m-3-3v6",
};

export function DIcon({ name, className = "w-5 h-5" }: { name: DIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
