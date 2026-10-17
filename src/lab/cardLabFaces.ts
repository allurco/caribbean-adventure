/**
 * Sample faces for the event card lab (#247, `?view=cards`): one per art
 * slot, worded like the HUD's, so each card's art and flag can be checked
 * before its slice of the deck lands. Dev only.
 */
import { NATIONS, PORT_NATIONS, type PortNation } from "../game/types";
import { CARD_ART, EVENT_ART_KINDS, type EventArtKind } from "../board/cardArtSlots";
import type { EventCardFace } from "../board/eventCardView";

const SAMPLES: Readonly<Record<EventArtKind, { title: string; region: string | null; effect: string }>> = {
  calmSeas: { title: "Calm seas", region: null, effect: "The sea lies quiet." },
  merchantConvoy: { title: "Merchant convoy", region: "the Spanish Main", effect: "2 merchants sail from Havana, bound for Port Royal and Tortuga." },
  storm: { title: "Storm", region: "the Windward Reach", effect: "A squall gathers for three rounds; every hex in it costs two moves." },
  flotillaPatrol: { title: "Flotilla patrol", region: "the King's Sound", effect: "A flotilla patrols these waters, hunting the pirates its crown wants." },
  npcPirate: { title: "NPC pirate", region: "the Leeward Banks", effect: "A pirate sloop lurks here for six rounds, preying on honest traders." },
  clemency: { title: "Clemency", region: null, effect: "The crown pardons every pirate it held a bounty on." },
  lostFlag: { title: "Lost flag", region: "Albion Waters", effect: "Port Royal strikes its colours and raises a new flag." },
};

/** The sample face of `kind`, flying `nation`'s flag when its art has one. */
export function labFace(kind: EventArtKind, nation: PortNation | null, id = 1): EventCardFace {
  return { id, ...SAMPLES[kind], art: kind, nation: CARD_ART[kind].flag ? (nation ?? "England") : null };
}

/** The nations a flagged card can fly: every crown for a patrol; the Pirates too for a lost flag. */
export function labNations(kind: EventArtKind): readonly PortNation[] {
  if (!CARD_ART[kind].flag) return [];
  return kind === "lostFlag" ? PORT_NATIONS : NATIONS;
}

/** Every face the lab lays out: each kind once, or once per nation when it flies a flag. */
export function labFaces(): EventCardFace[] {
  let id = 0;
  return EVENT_ART_KINDS.flatMap((kind) => {
    const nations = labNations(kind);
    return nations.length === 0 ? [labFace(kind, null, ++id)] : nations.map((nation) => labFace(kind, nation, ++id));
  });
}
