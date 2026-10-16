# Ledger card art prompts

Prompts for the illustrations on the cards that live in the parchment ledger UI: mission cards (secret orders, #326), rumours (#329) and deeds (#328), all slices of #319. Like the event cards (`event-card-prompts.md`), the images are generated with an image model (Nano Banana, in Google Flow) and then added to the game with the slice that uses them. Keep this file in step with those slices: a new card kind gets its prompt here.

## Rules for the art

- **A different style from the event cards.** Event and order cards are painterly, to match the 3D board's golden-hour look (ADR 0002). These cards sit in the online shell's parchment UI, so they are ink engravings on parchment in the shell's palette: ink `#2b1d10`, parchment `#e5d4a9`, wax red `#8a2617`. Don't mix the two prompt sets.
- **Art only.** No text, frame or border in the image. The UI draws the card's title and text in the shell's typography (IM Fell English, EB Garamond).
- **Landscape 4:3**, generated at 1024×768 or larger. The deed frame and emblems are square, 1024×1024. The game converts each image to WebP at the size the UI needs. At card size they show at about 200–300 px wide, so the subject must still read when scaled down.
- **One look across the set.** Generate each group (missions, rumours, deeds) in one session, or with the same seed if the tool allows, so the hatching and the ink match.
- **No lettering.** If the generator adds any, regenerate.
- **Origin.** The images are AI-generated. Record that in `NOTICE` when they are added.

## Style block

Paste this at the start of every prompt.

```
Hand-inked copperplate engraving illustration in the style of an 18th-century
Caribbean sea chart, dark brown ink (#2b1d10) linework with fine cross-hatching on
aged parchment (#e5d4a9), a single accent of wax red (#8a2617) used sparingly, no
text, no letters, no numbers, no border, no frame, centred subject with empty
parchment around it, 1024x768.
```

## Mission cards (#326)

One face per mission type, and one back for the secret orders hand.

### Delivery

```
A sealed leather dispatch case tied with cord and a red wax seal, resting on a coil of rope beside a
ship's lantern.
```

### Assassination

```
A merchant ship's stern seen through the smoke of a cannon broadside, a single red pennant on its mast.
```

### Escort

```
A small sloop sailing close behind a larger merchant ship through a narrow channel between rocks, calm sea.
```

### Region mission

```
A hand pinning a red-wax-marked corner of a sea chart showing an island cluster, a pair of dividers
lying across it.
```

### Card back (the secret orders)

```
A folded letter of orders sealed with a large red wax seal bearing an anchor, centred on parchment,
symmetrical composition.
```

## Rumours (#329)

### Card back

```
Two sailors whispering at a tavern table by candlelight, one pointing at a crumpled scrap of map,
tankards beside them.
```

### True (found)

```
An open sea chest half-buried in sand on a small beach, a few coins spilling out, a ship anchored offshore.
```

### False (empty)

```
An empty sea chest lying open on a rocky shore, a seagull perched on its lid, nothing inside.
```

## Deeds (#328)

One shared frame, with a small emblem per kind of deed set in its centre. Square, 1024×1024: replace `1024x768` in the style block.

### Frame

```
A circular brass medallion frame with a rope border and a blank parchment centre, seen face-on,
symmetrical.
```

### Emblems

One image each, centred and small:

- **Combat deed:** `Two crossed cannons.`
- **Exploration deed:** `A compass rose.`
- **Trade deed:** `A stacked pile of trade crates.`
- **Flotilla deed:** `A skull over an anchor.`

## Made so far

| Card | Status |
|---|---|
| Delivery, Assassination, Escort | Made (1200×896). In the Escort image the sloop sails alongside the merchant ship rather than behind it; kept, as it still reads as an escort. |
| Region mission, mission card back | To make |
| Rumours (back, found, empty) | To make |
| Deed frame and emblems | To make |
