# Event card art prompts

Prompts for the illustrations on the event deck's cards (#240). The images are generated with an image model (Nano Banana, in Google Flow) and then added to the game. Keep this file in step with the deck: a new card kind gets its prompt here.

## Rules for the art

- **Art only.** No text, frame or border in the image. The HUD draws the parchment frame and the card's title in the online shell's typography (IM Fell English, EB Garamond) and palette (parchment `#e5d4a9`, ink `#2b1d10`, brass `#b98b3e`, wax red `#8a2617`). This keeps the lettering crisp and editable.
- **Vertical 3:4**, exported at 896×1200 or larger (the HUD frame is 3:4). The game converts it to WebP at the size the HUD needs.
- **One look across the deck.** Generate one hero card first (Storm), then attach it as the reference image for every other card with the line: `Match the painting style, palette, lighting and brushwork of the reference image exactly.`
- **The register is ADR 0002's:** bold, stylised shapes under realistic golden-hour light and water.
- **Origin.** The images are AI-generated. Record that in `NOTICE` when they are added.

## Landing the art

The HUD already has a slot for every card and the back (`src/board/cardArtSlots.ts`), each drawing a placeholder engraving until its image exists (#247). To land one: convert it to WebP, 3:4 and no larger than 768×1024 (the card frame is at most 256 CSS px wide, shown at up to 3× density), put it under `public/cards/` and name it as the slot's `file`; the table's tests (`cardArtSlots.test.ts`, and `cardArtFiles.node.test.ts` for the files themselves) and the board's loading gate pick it up. Crop the card back's dark margin first, then to 3:4: the corners are rounded in CSS. For Flotilla patrol and Lost flag, also add a mask the size of the art (`<name>.flag.webp`, opaque over the flag's cloth, transparent elsewhere) as the slot's `flag.mask` (WebP, the art's exact size), and set `flag.box` to the flag's bounding box in the frame: the HUD lays the card's nation's flag over the box, cut to the mask (`src/board/cardFlag.ts`). Check each card at `?view=cards` on the dev server.

## Style block

Paste this at the start of every prompt.

```
Illustration for a naval strategy board game event card, Caribbean, early 1600s, age of sail.
Painterly hand-painted style, like a vintage nautical oil painting crossed with a modern board game card:
bold readable silhouettes, chunky exaggerated shapes, rich but limited palette of warm parchment,
deep sea teal, tar brown, brass and gold, with one accent of wax red. Strong golden-hour light,
low warm sun, long shadows, luminous realistic water with clear turquoise shallows.
Composition reads at small size: one clear focal subject, simple background, generous negative space
in the top third. Vertical 3:4 portrait. No text, no letters, no numbers, no logos, no borders,
no frame, no watermark, no modern objects.
```

## Cards

### Calm seas

```
A single small merchant sloop resting on a glassy, mirror-calm turquoise sea, sails slack, a gentle
haze on the horizon, a distant palm-fringed island, gulls overhead. Peaceful, quiet, slightly drowsy mood.
```

### Merchant convoy

```
Two heavy-laden merchant flutes sailing in line across open water, bellies full of crates and barrels
lashed on deck, sails full of a steady trade wind, a port town with terracotta roofs and a stone tower
fading behind them. Prosperous, purposeful mood.
```

### Storm

```
A towering squall descending on the sea: a black anvil cloud, slanting curtains of rain, a jagged
lightning bolt, whitecapped steep waves; a lone frigate heeling hard under reefed sails in the lower
third, lit by one shaft of warm sunlight breaking through. Menacing, dramatic mood.
```

### Flotilla patrol

The ensign stays plain dark red, so one image serves all four nations. The game tints it, or composites the nation's flag over it: the same flags the nations' ships fly on the board (`src/board/shipFlags.ts`, the one source): St George's cross for England, the Cross of Burgundy for Spain, a white cross on royal blue for France (the merchant ensign of the period), the Prince's flag for the Netherlands, and the Jolly Roger for a port the Pirates take.

```
Two naval warships in close formation bearing down on the viewer, gunports open with cannon run out,
a large national naval ensign streaming from the stern (leave the flag plain dark red so it can be
recoloured per nation), a coastal fort on a headland behind them. Stern, authoritative, threatening mood.
```

### NPC pirate

```
A lean, dark-hulled pirate sloop slipping out from behind a rocky cove at dusk, patched sails, a black
flag with a white skull at the masthead, a few lanterns glowing, cutlasses glinting along the rail.
Sly, predatory, dangerous mood.
```

### Clemency

```
A royal pardon: a rolled parchment scroll tied with ribbon and sealed with a large wax-red seal,
resting on a captain's sea chest beside a coiled rope and an unlit lantern; through a cabin window
behind, a calm harbour at golden hour. Relief, mercy, quiet authority.
```

### Lost flag

Of its two flags, the game tints the **new one being hoisted**, the taker's: it stays plain dark red like the patrol's ensign. The falling flag is the loser's, which the card does not name, so it stays faded and torn, with no colours or design a nation could be read from.

```
A port's flagpole atop a weathered stone fort: one faded, tattered flag with no recognisable design torn
and falling, a new flag being hoisted in its place (leave the new flag plain dark red so it can be
recoloured per nation), cannon smoke drifting across the ramparts, the harbour and terracotta roofs
below. Turning point, upheaval, conquest.
```

### Card back

One image for the whole deck.

```
Symmetrical card back design: an ornate brass compass rose at the centre on aged parchment, faint
sea-chart lines and rhumb lines radiating out, a thin decorative rope border motif, muted and
low-contrast so it never competes with card faces. Square-on, flat, no perspective.
```

## Order cards

The faces of the three secret orders, flipped together at the reveal (#259, #269). Same style block, same Storm reference image, same compass-rose back. Each shows the order from the player's own side, with a plain dark red ensign the game tints per nation.

### Broadside

```
A frigate seen side-on at close range, her whole broadside erupting at once: a row of cannon run out
through open gunports, orange muzzle flashes, thick white powder smoke rolling low along the water and
drifting downwind, the hull heeling away from the recoil, splashes of spent shot in the water ahead.
Plain dark red ensign at the stern. Thunderous, decisive, aggressive mood.
```

### Close in

```
Two ships grinding hull to hull at close quarters: grappling hooks on taut lines flying across the gap
and biting into the enemy rail, a boarding party with cutlasses and pistols crouched to leap from the
nearer ship, splintered planking and tangled rigging between them, a thin haze of smoke. Plain dark red
ensign on the nearer ship. Reckless, brutal, high-stakes mood.
```

### Bear away

```
A frigate turning away and running before the wind, seen from astern quarter: every sail full and
billowing, bow lifting through a long white wake, a bank of cannon smoke and a pursuing ship's silhouette
falling behind in the haze, open sea ahead lit by low golden sun. Plain dark red ensign streaming forward.
Daring, swift, escape mood.
```

## Later cards

- **Hurricane** (#241): the Storm prompt, with "a vast spiralling cyclone seen from above the horizon".
