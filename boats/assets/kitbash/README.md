# Kitbash sources

Third-party assets used for the **fittings only** — cannons, anchors, wheel, barrels,
lanterns, rigging blocks. The hull, bulwarks and decks stay procedural, by the
maintainer's ruling.

Downloaded binaries are gitignored. This file is the provenance record and must list
every asset actually used, with its licence, before anything ships.

## Quaternius — Pirate Kit (November 2023) — NOT YET DOWNLOADED

- Licence: **CC0** (https://creativecommons.org/publicdomain/zero/1.0/) — no
  attribution required, commercial use fine.
- Page: https://quaternius.com/packs/piratekit.html
- 71 models, formats FBX / OBJ / glTF / Blend, single texture atlas.
- Download is a Google Drive folder, id `1KjMzhVsDcyvYMWeVjZcRfuu8auBLpNi2`:
  - `Blends`  `1xLlPxWrdo8ndoYnm7y1CYnbdeXLX4KwI`
  - `FBX`     `103WUlc7ttjHegfyDZaQ-GQy2PkCGrjOv`
  - `glTF`    `11paA9BQwPiV5Xj2JJKgsBSR59S4m5JuC`
  - `OBJ`     `1NhRUiLjEodbUPY4txfydMFgIHBRvuFyh`
  - `Atlas_Pirate.png` `1bLKM6Nm_jTtXJN0CVK0GNqHto3eMGn6r`
  - `Preview.png` `17Gv6TFKfW0j2ONnkFphYD0FfzQqzoJGN`

**Blocked 2026-10-03:** Google Drive returns *"Too many users have viewed or
downloaded this file recently"* for every file in the folder. That is Drive's
public-quota limit on a popular share, not a permissions problem, and it clears on
its own in up to 24 h. `curl` on the `uc?export=download` endpoint returns Drive's
HTML interstitial rather than the file, so use `gdown`, which handles the confirm
token:

    uv run --with gdown gdown --folder 1xLlPxWrdo8ndoYnm7y1CYnbdeXLX4KwI -O Blends

Not mirrored on itch.io — `quaternius.itch.io` carries Fantasy Props, Stylized
Nature, 150+ Nature and Spaceships, but not the Pirate Kit.

**Verify the contents before relying on this pack.** The partial listing that came
back before the quota hit was dominated by `Characters_*`, `Weapon_*` and `UI_*`
entries (cutlasses, pistols, lutes, swords) with no `Cannon`, `Barrel`, `Wheel` or
`Anchor` among the names seen. It may be a character-and-weapon kit rather than a
ship-fittings kit, in which case it is the wrong pack for this project and the
search should move on.

## Alternatives not yet tried

- https://opengameart.org/content/lowpoly-ship-pack — Quaternius, CC0, direct
  download, no Drive quota.
- https://opengameart.org/content/low-poly-pirate-ship — CC0, ships as `.blend`.
- Poly Haven / Poly Pizza / Sketchfab via the Blender MCP, once they are enabled
  in the addon sidebar (Poly Haven is a checkbox; the other two need free API keys).

## 2026-10-03: this pack is the WRONG PACK — do not retry the download

The `gdown --folder` re-run exited 0 but downloaded **zero files** (still
quota-blocked, and it fails silently rather than erroring). It did return the
folder listing, which settles the question the earlier session could not:

`Characters_*`, `Prop_Fish_Mackerel`, `Prop_Fish_Tuna`, `Prop_GoldBag`,
`Prop_Skull`, `Scene_AllModels`, `Ship_Large`, `Ship_Small`, `UI_*`, `Weapon_*`

There is **no** Cannon, Barrel, Wheel, Anchor or Lantern anywhere in it. The
Quaternius Pirate Kit is a character-and-weapon pack that happens to ship two
whole low-poly ships — not the ship-fittings pack this project needs for tasks
11+. The Drive quota is now irrelevant; stop spending on it.

Next candidates, in order: OpenGameArt's CC0 LowPoly Ship Pack (no quota,
direct download, listed below), or Poly Pizza once the Blender integrations are
enabled — it shows licence and triangle count per result, which is what the
budget needs.
