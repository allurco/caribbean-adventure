import { ROOM } from "../fixtures";
import type { Screen } from "../shellKeys";
import type { DIconName } from "./DIcon";

/** THROWAWAY PROTOTYPE: variant D's navigation, B's five destinations. Profile is not built. */
export interface NavItem {
  key: Screen | "profile";
  label: string;
  icon: DIconName;
}

export const NAV: readonly NavItem[] = [
  { key: "home", label: "Play", icon: "anchor" },
  { key: "lobby", label: "Lobby", icon: "board" },
  { key: "party", label: "Party", icon: "crew" },
  { key: "queue", label: "Ranked", icon: "crown" },
  { key: "profile", label: "Profile", icon: "compass" },
];

/** The room is reached from Play, so Play stays lit while you sit in one. */
export function activeNav(screen: Screen): NavItem["key"] {
  return screen === "room" ? "home" : screen;
}

export const TITLES: Record<Screen, { title: string; meta: string }> = {
  signin: { title: "Caribbean Merchant", meta: "" },
  home: { title: "Play", meta: "Your voyages and where to find a new one" },
  room: { title: ROOM.name, meta: "Private room. You are the host." },
  lobby: { title: "Lobby", meta: "Public rooms looking for captains" },
  party: { title: "Party", meta: "Sail together: queue and join rooms as one crew" },
  queue: { title: "Ranked", meta: "Matched by rating, your party queues together" },
};
