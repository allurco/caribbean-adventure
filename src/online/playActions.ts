/**
 * The ways in on the shell's Play sheet (#125), after the voyages: a private
 * room (#112), the screens still coming (lobby #117, party #119, ranked #121),
 * and the local game. Nothing here counts rooms, ratings or crews the
 * backend does not have yet. Pure, no React.
 */
import { newRoomPath } from "./onlineRoute";
import type { ShellIconName } from "./shellNav";
import { comingPath, localGamePath } from "./shellRoute";

export interface PlayAction {
  title: string;
  sub: string;
  href: string;
  icon: ShellIconName;
}

export const PLAY_ACTIONS: readonly PlayAction[] = [
  { title: "Open a private room", sub: "Invite friends with a link", href: newRoomPath(), icon: "plus" },
  { title: "Browse the lobby", sub: "Public rooms: coming", href: comingPath("lobby"), icon: "board" },
  { title: "Your party", sub: "Sail as one crew: coming", href: comingPath("party"), icon: "crew" },
  { title: "Ranked queue", sub: "Matched by rating: coming", href: comingPath("ranked"), icon: "crown" },
  { title: "Sail alone", sub: "This device, against the merchant fleets", href: localGamePath(), icon: "sail" },
];
