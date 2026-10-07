/**
 * Every sound the game can play (#73), with where it came from. The files
 * live in `public/sounds/` and each is listed in the root `NOTICE`; only
 * CC0 sources go in, since the repo is public. The sound lab
 * (`?view=sound`) plays them all for approval by ear.
 */

export type SoundKind = "ui" | "world" | "ambience";

export type SoundId = "ui-click" | "ship-wash" | "coins" | "cannon-fire" | "sea-waves";

export interface SoundCredit {
  /** The source's title, as published. */
  title: string;
  author: string;
  url: string;
  licence: "CC0";
  /** What was done to the original, if anything. */
  changes?: string;
}

export interface SoundEntry {
  id: SoundId;
  /** File name under `public/sounds/`. */
  file: string;
  kind: SoundKind;
  /** Base gain before the player's master volume, 0..1. */
  volume: number;
  loop: boolean;
  label: string;
  credit: SoundCredit;
}

export const SOUNDS: readonly SoundEntry[] = [
  {
    id: "ui-click",
    file: "ui-click.ogg",
    kind: "ui",
    volume: 0.5,
    loop: false,
    label: "UI click",
    credit: {
      title: "Interface Sounds (click_001)",
      author: "Kenney",
      url: "https://opengameart.org/content/interface-sounds",
      licence: "CC0",
      changes: "mono, normalised",
    },
  },
  {
    id: "ship-wash",
    file: "ship-wash.ogg",
    kind: "world",
    volume: 0.2,
    loop: false,
    label: "Ship sails a hex (hull wash)",
    credit: {
      title: "40 CC0 water / splash / slime SFX (loop_water_02)",
      author: "rubberduck",
      url: "https://opengameart.org/content/40-cc0-water-splash-slime-sfx",
      licence: "CC0",
      changes:
        "1.9 s of rushing water layered with a wave wash (Beach Ocean Waves, jasinski) and a low hull bed (Tiny Naval Battle Sounds Set, qubodup), swelled in and washed out, mono",
    },
  },
  {
    id: "coins",
    file: "coins.ogg",
    kind: "ui",
    volume: 0.6,
    loop: false,
    label: "Coins (trade, purchase)",
    credit: {
      title: "50 RPG sound effects (handleCoins)",
      author: "Kenney",
      url: "https://opengameart.org/content/50-rpg-sound-effects",
      licence: "CC0",
      changes: "mono, normalised",
    },
  },
  {
    id: "cannon-fire",
    file: "cannon-fire.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon fire",
    credit: {
      title: "Battle at sea (cannon_fire_1)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "trimmed to 2.6 s with a faded tail, mono, normalised",
    },
  },
  {
    id: "sea-waves",
    file: "sea-waves-loop.ogg",
    kind: "ambience",
    volume: 0.5,
    loop: true,
    label: "Sea waves (loop)",
    credit: {
      title: "Beach Ocean Waves (wave_01 to wave_04)",
      author: "jasinski",
      url: "https://opengameart.org/content/beach-ocean-waves",
      licence: "CC0",
      changes: "four clips crossfaded into one seamless 9.7 s loop, mono",
    },
  },
];

const BY_ID = new Map<SoundId, SoundEntry>(SOUNDS.map((s) => [s.id, s]));

export function soundById(id: SoundId): SoundEntry {
  const sound = BY_ID.get(id);
  if (!sound) throw new Error(`Unknown sound: ${id}`);
  return sound;
}

/** The URL a sound is served from, under the app's base path (Vite's `BASE_URL`, with its trailing slash). */
export function soundUrl(sound: SoundEntry, base: string): string {
  return `${base}sounds/${sound.file}`;
}
