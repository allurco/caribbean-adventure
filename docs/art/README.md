# Art manifest

The one list of every 2D image the game needs: what each shows, the prompt that makes it, where it goes and how far along it is. Generated art that is not listed here gets lost, so **a new image slot is added here, with its prompt, in the same change that adds the slot**. The prompts themselves live in the two prompt docs, one per style:

- [`event-card-prompts.md`](event-card-prompts.md): painterly cards that match the 3D board's golden-hour look (event cards, order cards).
- [`ledger-card-prompts.md`](ledger-card-prompts.md): ink engravings on parchment for the online shell's ledger UI (missions, rumours, deeds).

`src/board/artManifest.node.test.ts` holds this file to the code: every table line is a row that parses, every event card slot in `src/board/cardArtSlots.ts` and every image under `public/` has a row, a row is `wired` exactly when the code loads its file and `in repo` or `wired` exactly when its file is under `public/`, an event card's row names the file `CARD_ART` names, and every prompt link points at a heading that exists. So a change that lands or wires an image fails the test until it moves the row.

## How to read the tables

- **Slot**: the slot's id, `family.name`. Event card slots use the keys of `CARD_ART` in `cardArtSlots.ts`.
- **Prompt**: a link to the prompt's heading in its prompt doc, or a note when the image is not prompted (a capture, a mask cut from the art).
- **Style**: `painterly event`, `ink engraving ledger`, `capture` (rendered from the game itself), `icon` or `texture`.
- **Size**: aspect, then the size it is generated at, then the size it ships at when that differs.
- **Target**: the path under `public/` the image is served from. For a slot not yet wired it is the planned path; the change that wires it may pick another, and updates the row.
- **Status**:
  - `needed`: no image yet.
  - `made`: generated, but not in the repo yet (ask the maintainer for the file).
  - `in repo`: the file is committed under `public/`, but nothing loads it.
  - `wired`: the file is committed and the code loads it.
- **Wired by**: the issue that brings the image into the game.

Every image is AI-generated unless the row says otherwise. Record that in `NOTICE` when a file is added.

## Event cards

Painterly, 3:4, no text (the HUD draws the frame and title). Generated at 896×1200, shipped as WebP no larger than 768×1024. Landing one: [Landing the art](event-card-prompts.md#landing-the-art).

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `event.calmSeas` | A merchant sloop on a mirror-calm sea | [Calm seas](event-card-prompts.md#calm-seas) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/calm-seas.webp` | wired | #247 |
| `event.merchantConvoy` | Two laden flutes sailing out of port | [Merchant convoy](event-card-prompts.md#merchant-convoy) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/merchant-convoy.webp` | wired | #247 |
| `event.storm` | A frigate heeling under a squall (the style reference for the deck) | [Storm](event-card-prompts.md#storm) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/storm.webp` | wired | #247 |
| `event.flotillaPatrol` | Two warships bearing down, a plain red ensign | [Flotilla patrol](event-card-prompts.md#flotilla-patrol) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/flotilla-patrol.webp` | wired | #247 |
| `event.flotillaPatrol.flag` | Mask over the patrol's ensign, tinted per nation | None: cut by hand from the patrol's art | mask | the art's exact size | `cards/flotilla-patrol.flag.webp` | wired | #247 |
| `event.npcPirate` | A pirate sloop slipping out of a cove at dusk | [NPC pirate](event-card-prompts.md#npc-pirate) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/npc-pirate.webp` | wired | #247 |
| `event.clemency` | A sealed royal pardon on a sea chest | [Clemency](event-card-prompts.md#clemency) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/clemency.webp` | wired | #247 |
| `event.lostFlag` | A fort's flag falling, a plain red one hoisted | [Lost flag](event-card-prompts.md#lost-flag) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/lost-flag.webp` | wired | #247 |
| `event.lostFlag.flag` | Mask over the hoisted flag, tinted per nation | None: cut by hand from the lost flag's art | mask | the art's exact size | `cards/lost-flag.flag.webp` | wired | #247 |
| `event.back` | Brass compass rose on a sea chart, shared by every card | [Card back](event-card-prompts.md#card-back) | painterly event | 3:4, 896×1200 → 768×1024, dark margin cropped | `cards/back.webp` | wired | #247 |
| `event.hurricane` | A vast hurricane dwarfing a merchant ship | [Hurricane](event-card-prompts.md#hurricane) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/hurricane.webp` | made | #241 |

## Order cards

The faces of the combat's orders, flipped with the draw's dice (#269); which counter-order each goes with is settled in #365. Same style, size and back as the event cards.

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `order.broadside` | A frigate's whole broadside firing | [Broadside](event-card-prompts.md#broadside) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/order-broadside.webp` | made | #269 |
| `order.closeIn` | Two ships grappled, a boarding party ready | [Close in](event-card-prompts.md#close-in) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/order-close-in.webp` | made | #269 |
| `order.bearAway` | A frigate running before the wind, a pursuer behind | [Bear away](event-card-prompts.md#bear-away) | painterly event | 3:4, 896×1200 → 768×1024 | `cards/order-bear-away.webp` | made | #269 |

## Ledger cards

Ink engravings on parchment for the cards in the shell's ledger UI (#319). Landscape 4:3, made at 1200×896; the deed frame and emblems square, 1024×1024. Shipped as WebP at the size the UI needs (about 200 to 300 px wide, at up to 3× density). All thirteen are made; see [Made so far](ledger-card-prompts.md#made-so-far) for where the images depart from the prompts.

### Missions (secret orders, #326)

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mission.delivery` | A sealed dispatch case on a coil of rope | [Delivery](ledger-card-prompts.md#delivery) | ink engraving ledger | 4:3, 1200×896 | `ledger/mission-delivery.webp` | made | #326 |
| `mission.assassination` | A merchant's stern through broadside smoke | [Assassination](ledger-card-prompts.md#assassination) | ink engraving ledger | 4:3, 1200×896 | `ledger/mission-assassination.webp` | made | #326 |
| `mission.escort` | A sloop beside a merchant ship in a channel | [Escort](ledger-card-prompts.md#escort) | ink engraving ledger | 4:3, 1200×896 | `ledger/mission-escort.webp` | made | #326 |
| `mission.region` | A hand pinning a sea chart, dividers across it | [Region mission](ledger-card-prompts.md#region-mission) | ink engraving ledger | 4:3, 1200×896 | `ledger/mission-region.webp` | made | #326 |
| `mission.back` | A folded letter of orders under a wax seal | [Card back (the secret orders)](ledger-card-prompts.md#card-back-the-secret-orders) | ink engraving ledger | 4:3, 1200×896 | `ledger/mission-back.webp` | made | #326 |

### Rumours (#329)

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rumour.back` | Two sailors whispering over a scrap of map | [Card back](ledger-card-prompts.md#card-back) | ink engraving ledger | 4:3, 1200×896 | `ledger/rumour-back.webp` | made | #329 |
| `rumour.found` | A sea chest full of coins on a beach | [True (found)](ledger-card-prompts.md#true-found) | ink engraving ledger | 4:3, 1200×896 | `ledger/rumour-found.webp` | made | #329 |
| `rumour.empty` | An empty sea chest on a rocky shore | [False (empty)](ledger-card-prompts.md#false-empty) | ink engraving ledger | 4:3, 1200×896 | `ledger/rumour-empty.webp` | made | #329 |

### Deeds (#328)

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `deed.frame` | A brass medallion with a rope border, blank centre | [Frame](ledger-card-prompts.md#frame) | ink engraving ledger | 1:1, 1024×1024 | `ledger/deed-frame.webp` | made | #328 |
| `deed.combat` | Two crossed cannons | [Emblems](ledger-card-prompts.md#emblems) | ink engraving ledger | 1:1, 1024×1024 | `ledger/deed-combat.webp` | made | #328 |
| `deed.exploration` | A compass rose | [Emblems](ledger-card-prompts.md#emblems) | ink engraving ledger | 1:1, 1024×1024 | `ledger/deed-exploration.webp` | made | #328 |
| `deed.trade` | A stacked pile of trade crates | [Emblems](ledger-card-prompts.md#emblems) | ink engraving ledger | 1:1, 1024×1024 | `ledger/deed-trade.webp` | made | #328 |
| `deed.flotilla` | A skull over an anchor | [Emblems](ledger-card-prompts.md#emblems) | ink engraving ledger | 1:1, 1024×1024 | `ledger/deed-flotilla.webp` | made | #328 |

## The harbour still

Captured from the game itself, not generated: re-capture it whenever the harbour's map, camera or look changes ([`docs/harbour-still.md`](../harbour-still.md)).

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `harbour.still` | The online shell's harbour backdrop at first paint | None: `npm run capture:harbour` | capture | 2.4:1, 2400×1000 | `harbour/harbour-still.webp` | wired | #122 |

## Icons and the web manifest

The app's icons (#123), downscaled from the maintainer's chosen artwork; no prompt was recorded for it. `src/landscape/webManifest.node.test.ts` holds their sizes.

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `icon.favicon` | The page's favicon (`index.html`) | None: downscaled from the app icon's artwork | icon | 1:1, 48×48 | `favicon-48.png` | wired | #123 |
| `icon.appleTouch` | The iOS home-screen icon (`index.html`), opaque | None: downscaled from the app icon's artwork | icon | 1:1, 180×180 | `apple-touch-icon.png` | wired | #123 |
| `icon.192` | The web manifest's 192 px icon | None: downscaled from the app icon's artwork | icon | 1:1, 192×192 | `icon-192.png` | wired | #123 |
| `icon.512` | The web manifest's 512 px icon, any and maskable (the ship inside Android's safe circle) | None: downscaled from the app icon's artwork | icon | 1:1, 512×512 | `icon-512.png` | wired | #123 |

## Other files

| Slot | Shows | Prompt | Style | Size | Target | Status | Wired by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `texture.waterNormals` | A tiling water normal map, left over from an earlier sea; the sea's normals now come from the wave cascades | None: third-party texture | texture | 1:1, 1024×1024 | `waternormals.jpg` | in repo | none |

Not listed, because they are not image files: the shell's parchment and timber grain (inline SVG noise in `src/index.css`), the placeholder engravings the event cards draw until their art lands (`src/board/cardPlaceholders.ts`) and the per-nation flags (`src/board/shipFlags.ts`, `src/board/cardFlag.ts`), all drawn in code.
