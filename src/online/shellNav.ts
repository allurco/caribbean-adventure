/**
 * The online shell's navigation (#125): the five destinations on the nav
 * board, which one a page lights, and the title and line on the hanging
 * nameboard over the sheet. Pure, no React.
 */
import { accountPath } from "./accountRoute";
import type { Profile } from "./accountService";
import { comingPath, playPath, type ShellPage } from "./shellRoute";

export type ShellIconName = "anchor" | "board" | "crew" | "crown" | "compass" | "plus" | "sail";

export type NavKey = "play" | "lobby" | "party" | "ranked" | "profile";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: ShellIconName;
  href: string;
}

export const SHELL_NAV: readonly NavItem[] = [
  { key: "play", label: "Play", icon: "anchor", href: playPath() },
  { key: "lobby", label: "Lobby", icon: "board", href: comingPath("lobby") },
  { key: "party", label: "Party", icon: "crew", href: comingPath("party") },
  { key: "ranked", label: "Ranked", icon: "crown", href: comingPath("ranked") },
  { key: "profile", label: "Profile", icon: "compass", href: accountPath() },
];

/**
 * The nav item `page` lights, for the signed-in player `ownId` (null when
 * signed out): rooms are reached from Play, so Play stays lit in them; a
 * rival's profile lights nothing.
 */
export function activeNav(page: ShellPage, ownId: string | null): NavKey | null {
  switch (page.kind) {
    case "play":
    case "newRoom":
    case "room":
    case "join":
      return "play";
    case "coming":
      return page.screen;
    case "account":
      return "profile";
    case "profile":
      return ownId !== null && page.id === ownId ? "profile" : null;
  }
}

/**
 * Whether the party board (the desktop dock, or the seal cluster on a phone)
 * shows: only to a signed-in `captain` (null when signed out, on a public
 * profile), and not on the party screen, which it would only repeat.
 */
export function showsPartyBoard(page: ShellPage, captain: Profile | null): boolean {
  return captain !== null && !(page.kind === "coming" && page.screen === "party");
}

export interface Nameboard {
  title: string;
  /** The line under the title; empty for none. */
  meta: string;
}

/** The hanging nameboard's title and line for `page`. */
export function nameboardFor(page: ShellPage): Nameboard {
  switch (page.kind) {
    case "play":
      return { title: "Play", meta: "Your voyages and where to find a new one" };
    case "coming":
      return COMING_BOARDS[page.screen];
    case "account":
      return { title: "Your captain", meta: "Your name on the seas, and your account" };
    case "profile":
      return { title: "Captain's profile", meta: "" };
    case "newRoom":
      return { title: "A private room", meta: "Invite your friends with a link; start once every seat is taken" };
    case "room":
      return { title: "The room", meta: "" };
    case "join":
      return { title: "An invitation", meta: "" };
  }
}

const COMING_BOARDS: Record<"lobby" | "party" | "ranked", Nameboard> = {
  lobby: { title: "Lobby", meta: "Public rooms looking for captains: coming" },
  party: { title: "Party", meta: "Sail together as one crew: coming" },
  ranked: { title: "Ranked", meta: "Matched by rating: coming" },
};
