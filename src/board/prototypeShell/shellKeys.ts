/** THROWAWAY PROTOTYPE (#104 online shell): the variant and screen keys the URL carries. */

export const SCREENS = ["signin", "home", "room", "lobby", "party", "queue"] as const;
export type Screen = (typeof SCREENS)[number];

export const VARIANTS = [
  { key: "A", name: "Harbour backdrop" },
  { key: "B", name: "Classic launcher" },
  { key: "C", name: "Captain's logbook" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export interface VariantProps {
  screen: Screen;
  go: (screen: Screen) => void;
}

export function readVariant(search: string): VariantKey {
  const v = new URLSearchParams(search).get("variant")?.toUpperCase();
  return VARIANTS.find((x) => x.key === v)?.key ?? "A";
}

export function readScreen(search: string): Screen {
  const s = new URLSearchParams(search).get("screen");
  return (SCREENS as readonly string[]).includes(s ?? "") ? (s as Screen) : "home";
}
