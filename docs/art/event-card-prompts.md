# Event card art prompts

Prompts for the illustrations on the event deck's cards (#240). The images are generated with an image model (Nano Banana, in Google Flow) and then added to the game. Keep this file in step with the deck: a new card kind gets its prompt here.

## Rules for the art

- **Art only.** No text, frame or border in the image. The HUD draws the parchment frame and the card's title in the online shell's typography (IM Fell English, EB Garamond) and palette (parchment `#e5d4a9`, ink `#2b1d10`, brass `#b98b3e`, wax red `#8a2617`). This keeps the lettering crisp and editable.
- **Vertical 2:3**, exported at 1024×1536 or larger. The game converts it to WebP at the size the HUD needs.
- **One look across the deck.** Generate one hero card first (Storm), then attach it as the reference image for every other card with the line: `Match the painting style, palette, lighting and brushwork of the reference image exactly.`
- **The register is ADR 0002's:** bold, stylised shapes under realistic golden-hour light and water.
- **Origin.** The images are AI-generated. Record that in `NOTICE` when they are added.

## Style block

Paste this at the start of every prompt.

```
Illustration for a naval strategy board game event card, Caribbean, early 1600s, age of sail.
Painterly hand-painted style, like a vintage nautical oil painting crossed with a modern board game card:
bold readable silhouettes, chunky exaggerated shapes, rich but limited palette of warm parchment,
deep sea teal, tar brown, brass and gold, with one accent of wax red. Strong golden-hour light,
low warm sun, long shadows, luminous realistic water with clear turquoise shallows.
Composition reads at small size: one clear focal subject, simple background, generous negative space
in the top third. Vertical 2:3 portrait. No text, no letters, no numbers, no logos, no borders,
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

The ensign stays plain dark red, so one image serves all four nations. The game tints it, or composites the nation's flag over it: St George's cross for England, the Burgundy cross for Spain, white with fleurs-de-lis for France, the Prince's flag for the Netherlands.

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

```
A port's flagpole atop a weathered stone fort: one national flag torn and falling, a new flag being
hoisted in its place, cannon smoke drifting across the ramparts, the harbour and terracotta roofs
below. Turning point, upheaval, conquest.
```

### Card back

One image for the whole deck.

```
Symmetrical card back design: an ornate brass compass rose at the centre on aged parchment, faint
sea-chart lines and rhumb lines radiating out, a thin decorative rope border motif, muted and
low-contrast so it never competes with card faces. Square-on, flat, no perspective.
```

## Later cards

- **Hurricane** (#241): the Storm prompt, with "a vast spiralling cyclone seen from above the horizon".
