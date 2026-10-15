/**
 * Every sound the game can play (#73), with where it came from. The files
 * live in `public/sounds/` and each is listed in the root `NOTICE`; only
 * CC0 sources go in, since the repo is public. The sound lab
 * (`?view=sound`) plays them all for approval by ear. A sound with several
 * takes (so a volley isn't mechanical) is numbered `<name>-1..n`; see
 * `soundVariants`.
 */

export type SoundKind = "ui" | "world" | "ambience";

export type SoundId =
  | "ui-click"
  | "ship-wash"
  | "coins"
  | "cannon-fire"
  | "sea-waves"
  | "sea-wide"
  | "sea-close"
  | "cannon-shot-1"
  | "cannon-shot-2"
  | "cannon-shot-3"
  | "cannon-shot-4"
  | "cannon-shot-5"
  | "cannon-shot-6"
  | "wood-crack-1"
  | "wood-crack-2"
  | "wood-crack-3"
  | "wood-crack-4"
  | "ball-splash-1"
  | "ball-splash-2"
  | "ball-splash-3"
  | "hull-groan"
  | "mast-crack"
  | "grapples"
  | "ship-breakup";

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
  {
    id: "sea-wide",
    file: "sea-wide-loop.ogg",
    kind: "ambience",
    volume: 0.5,
    loop: true,
    label: "Ambience bed: wide sea (map zoom)",
    credit: {
      title: "wind1 (wind1.wav)",
      author: "lukerustltd",
      url: "https://opengameart.org/content/wind1",
      licence: "CC0",
      changes:
        "synthesized wind over a distant, muffled wash of waves (Sea and river wave sounds, randommind), one seamless 24 s loop, mono",
    },
  },
  {
    id: "sea-close",
    file: "sea-close-loop.ogg",
    kind: "ambience",
    volume: 0.5,
    loop: true,
    label: "Ambience bed: close water (ship zoom)",
    credit: {
      title: "Sea and river wave sounds (VistulaShort)",
      author: "randommind",
      url: "https://opengameart.org/content/sea-and-river-wave-sounds",
      licence: "CC0",
      changes:
        "waves lapping near, a mains hum notched out, with a water trickle (40 CC0 water / splash / slime SFX, rubberduck) under it, one seamless 20 s loop, mono",
    },
  },
  {
    id: "cannon-shot-1",
    file: "cannon-shot-1.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 1 (near)",
    credit: {
      title: "Battle at sea (cannon_fire_1)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "trimmed to 1.7 s with a faded tail, mono, loudness-normalised",
    },
  },
  {
    id: "cannon-shot-2",
    file: "cannon-shot-2.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 2 (near, heavy)",
    credit: {
      title: "Battle at sea (cannon_fire_1)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "pitched down 14% for a heavier gun, trimmed to 1.9 s with a faded tail, mono, loudness-normalised",
    },
  },
  {
    id: "cannon-shot-3",
    file: "cannon-shot-3.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 3 (near, short)",
    credit: {
      title: "Tiny Naval Battle Sounds Set (GunShot.wav)",
      author: "qubodup (Iwan Gabovitch)",
      url: "https://opengameart.org/content/tiny-naval-battle-sounds-set",
      licence: "CC0",
      changes: "low end lifted, faded out over the last 0.4 s, mono, loudness-normalised",
    },
  },
  {
    id: "cannon-shot-4",
    file: "cannon-shot-4.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 4 (near, low)",
    credit: {
      title: "Tiny Naval Battle Sounds Set (GunShot.wav)",
      author: "qubodup (Iwan Gabovitch)",
      url: "https://opengameart.org/content/tiny-naval-battle-sounds-set",
      licence: "CC0",
      changes: "pitched down 10%, low end lifted, trimmed to 1.1 s with a faded tail, mono, loudness-normalised",
    },
  },
  {
    id: "cannon-shot-5",
    file: "cannon-shot-5.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 5 (far)",
    credit: {
      title: "Tiny Naval Battle Sounds Set (GunShotGverb.wav)",
      author: "qubodup (Iwan Gabovitch)",
      url: "https://opengameart.org/content/tiny-naval-battle-sounds-set",
      licence: "CC0",
      changes: "low-passed at 2.4 kHz for distance, trimmed to 1.8 s with a faded tail, mono, loudness-normalised quieter",
    },
  },
  {
    id: "cannon-shot-6",
    file: "cannon-shot-6.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Cannon shot 6 (far, echo)",
    credit: {
      title: "Battle at sea (cannon_fire_1)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "pitched up 6%, low-passed at 3 kHz with a short echo for distance, trimmed to 1.8 s, mono, loudness-normalised quieter",
    },
  },
  {
    id: "wood-crack-1",
    file: "wood-crack-1.ogg",
    kind: "world",
    volume: 0.7,
    loop: false,
    label: "Wood crack and splinter 1 (hit)",
    credit: {
      title: "35 wooden cracks/hits/destructions (crack07)",
      author: "Independent.nu (submitted by qubodup)",
      url: "https://opengameart.org/content/35-wooden-crackshitsdestructions",
      licence: "CC0",
      changes: "a splintering crack over a low wood thud, 1.0 s with a faded tail, mono, loudness-normalised; with 75 CC0 breaking / falling / hit sfx (bfh1_wood_hit_01), rubberduck",
    },
  },
  {
    id: "wood-crack-2",
    file: "wood-crack-2.ogg",
    kind: "world",
    volume: 0.7,
    loop: false,
    label: "Wood crack and splinter 2 (hit)",
    credit: {
      title: "35 wooden cracks/hits/destructions (crack09)",
      author: "Independent.nu (submitted by qubodup)",
      url: "https://opengameart.org/content/35-wooden-crackshitsdestructions",
      licence: "CC0",
      changes: "a splintering crack over a low wood thud, 1.0 s with a faded tail, mono, loudness-normalised; with 75 CC0 breaking / falling / hit sfx (bfh1_wood_hit_02), rubberduck",
    },
  },
  {
    id: "wood-crack-3",
    file: "wood-crack-3.ogg",
    kind: "world",
    volume: 0.7,
    loop: false,
    label: "Wood crack and splinter 3 (hit)",
    credit: {
      title: "35 wooden cracks/hits/destructions (crack10)",
      author: "Independent.nu (submitted by qubodup)",
      url: "https://opengameart.org/content/35-wooden-crackshitsdestructions",
      licence: "CC0",
      changes: "a splintering crack over a low wood thud, 0.9 s with a faded tail, mono, loudness-normalised; with 80 CC0 RPG SFX (wood_03), rubberduck",
    },
  },
  {
    id: "wood-crack-4",
    file: "wood-crack-4.ogg",
    kind: "world",
    volume: 0.7,
    loop: false,
    label: "Wood crack and splinter 4 (hit)",
    credit: {
      title: "35 wooden cracks/hits/destructions (crack05)",
      author: "Independent.nu (submitted by qubodup)",
      url: "https://opengameart.org/content/35-wooden-crackshitsdestructions",
      licence: "CC0",
      changes: "a splintering crack over a low wood thud, 1.1 s with a faded tail, mono, loudness-normalised; with 75 CC0 breaking / falling / hit sfx (bfh1_wood_hit_03), rubberduck",
    },
  },
  {
    id: "ball-splash-1",
    file: "ball-splash-1.ogg",
    kind: "world",
    volume: 0.6,
    loop: false,
    label: "Cannonball splash 1 (miss)",
    credit: {
      title: "Battle at sea (cannon_miss_1)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "trimmed to 1.6 s with a faded tail, mono, loudness-normalised",
    },
  },
  {
    id: "ball-splash-2",
    file: "ball-splash-2.ogg",
    kind: "world",
    volume: 0.6,
    loop: false,
    label: "Cannonball splash 2 (miss)",
    credit: {
      title: "Tiny Naval Battle Sounds Set (Splash.wav)",
      author: "qubodup (Iwan Gabovitch)",
      url: "https://opengameart.org/content/tiny-naval-battle-sounds-set",
      licence: "CC0",
      changes: "trimmed to 1.8 s with a faded tail, mono, loudness-normalised",
    },
  },
  {
    id: "ball-splash-3",
    file: "ball-splash-3.ogg",
    kind: "world",
    volume: 0.6,
    loop: false,
    label: "Cannonball splash 3 (miss)",
    credit: {
      title: "40 CC0 water / splash / slime SFX (splash_04, bubble_01)",
      author: "rubberduck",
      url: "https://opengameart.org/content/40-cc0-water-splash-slime-sfx",
      licence: "CC0",
      changes: "a splash with its low end lifted and a bubble after it, 1.0 s, mono, loudness-normalised",
    },
  },
  {
    id: "hull-groan",
    file: "hull-groan.ogg",
    kind: "world",
    volume: 0.6,
    loop: false,
    label: "Hull groan (hit lurch, sinking)",
    credit: {
      title: "Tree Creaking (tree_creak)",
      author: "antumdeluge",
      url: "https://opengameart.org/content/tree-creaking",
      licence: "CC0",
      changes: "4.4 s of a tree's creak slowed 30% into a hull's groan, low-passed, faded in and out, 6.2 s, mono, loudness-normalised",
    },
  },
  {
    id: "mast-crack",
    file: "mast-crack.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Mast cracks and falls",
    credit: {
      title: "35 wooden cracks/hits/destructions (crack03)",
      author: "Independent.nu (submitted by qubodup)",
      url: "https://opengameart.org/content/35-wooden-crackshitsdestructions",
      licence: "CC0",
      changes: "a long crack, the spar falling and striking (slowed 20%), then a splash, 3.7 s, mono, loudness-normalised; with 75 CC0 breaking / falling / hit sfx (bfh1_falling_04, bfh1_wood_hit_02), rubberduck; 40 CC0 water / splash / slime SFX (splash_11), rubberduck",
    },
  },
  {
    id: "grapples",
    file: "grapples.ogg",
    kind: "world",
    volume: 0.7,
    loop: false,
    label: "Grapples thrown and biting",
    credit: {
      title: "Swishes Sound Pack (swish-9, swish-7)",
      author: "artisticdude",
      url: "https://opengameart.org/content/swishes-sound-pack",
      licence: "CC0",
      changes: "two lines thrown (swishes slowed), iron biting wood, a chain rattle and a rope's creak, 1.7 s, mono, loudness-normalised; with Metal Impact Sounds (clink1, clink3), bmaczero; 80 CC0 RPG SFX (wood_03, wood_05, chain_01), rubberduck; 50 RPG sound effects (creak3), Kenney (www.kenney.nl)",
    },
  },
  {
    id: "ship-breakup",
    file: "ship-breakup.ogg",
    kind: "world",
    volume: 0.8,
    loop: false,
    label: "Ship breaks up and goes down",
    credit: {
      title: "Battle at sea (ship_destroyed_short)",
      author: "Thimras",
      url: "https://opengameart.org/content/battle-at-sea",
      licence: "CC0",
      changes: "6.4 s of the ship breaking up with a long fade, bubbles rising as she goes down, 7.0 s, mono, loudness-normalised; with 40 CC0 water / splash / slime SFX (loop_bubbles_1), rubberduck",
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

/** A sound's numbered takes (`<prefix>-1`, `<prefix>-2`, …) in order, for picking one at random; empty if it has none. */
export function soundVariants(prefix: string): SoundId[] {
  const take = (id: SoundId) => id.slice(prefix.length + 1);
  return SOUNDS.map((s) => s.id)
    .filter((id) => id.startsWith(`${prefix}-`) && /^\d+$/.test(take(id)))
    .sort((a, b) => Number(take(a)) - Number(take(b)));
}
