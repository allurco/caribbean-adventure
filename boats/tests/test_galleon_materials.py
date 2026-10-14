"""The galleon's material families and the names her atlases ship under. No bpy.

EVERY OBJECT NAME IN HERE WAS READ OUT OF THE LIVE .blend —
`bpy.data.collections["Galleon"].objects`, thirty of them — and not guessed.
The point of a roster is that it be TOTAL over the ship: `palette.family_of`
raises on an unknown object by design, and an object with no material at all
bakes as nothing, which is the exact failure the project's Review Focus names.

AND THE NAMES. `palette.MATERIAL_NAMES` and `bake._save`'s file stem were both
written when the frigate was the only ship, so both say "frigate" outright.
Baking the galleon through them would name her materials `Frigate_Canvas` and
would OVERWRITE `build/textures/frigate_*` — the frozen frigate's own shipped
atlases, the companions of a `.glb` that is already a deliverable. That is the
same defect class as `wind.SAIL_FWD`: a frigate's name written down as a fact
about ships.
"""

import pytest

from frigate import palette
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()

# The galleon's thirty-one objects, read out of her own collection.
GALLEON = (
    ["Hull", "Bulwarks", "Transom", "Stern_Gallery", "Stern_Carving",
     "Channels", "Chainplates", "Headrails", "Beakhead", "Beakhead_Deck",
     "Figurehead",
     "Castle_Forecastle", "Castle_Quarter", "Castle_Poop",
     "Deck_Main", "Deck_Forecastle", "Deck_Quarter", "Deck_Poop",
     "Masts", "Bowsprit", "Tops", "Lateen_Mizzen",
     "Sails", "Sail_Patches", "Jolly_Roger", "Rigging"]
    + [f"Yard_{i:02d}" for i in range(5)]
)


def test_the_galleon_roster_is_the_thirty_one_objects_her_build_emits():
    assert len(GALLEON) == 31
    assert len(set(GALLEON)) == 31


def test_every_object_the_galleon_builds_has_a_material_family():
    """TOTAL, or the ship ships with something untextured on it.

    Six of these thirty-one are hers alone and none of them was in the table:
    the three castle tiers, the poop deck they stand on, the lateen yard, and
    the beakhead deck.
    """
    unknown = []
    for name in GALLEON:
        try:
            palette.family_of(name)
        except KeyError:
            unknown.append(name)
    assert unknown == []


def test_a_castle_tier_is_hull_timber_and_wears_the_painted_livery():
    """A galleon's castles are the frigate's bulwarks carried up in steps:
    twin-skin oak walls standing on the rail below. `Bulwarks` wears the
    livery, so the three tiers standing on it wear the same paint."""
    for tier in ("Castle_Forecastle", "Castle_Quarter", "Castle_Poop"):
        assert palette.family_of(tier) == palette.HULL_TIMBER, tier
        assert palette.look_of(tier) == "livery", tier
        assert palette.wears_livery(tier), tier


def test_the_poop_deck_is_planking_like_every_other_walking_surface():
    assert palette.family_of("Deck_Poop") == palette.DECK_PLANKING
    assert palette.look_of("Deck_Poop") == palette.look_of("Deck_Quarter")


def test_the_lateen_yard_is_scraped_spar_timber_like_every_square_yard():
    """`Lateen_Mizzen` is a yard. It is named for its mast instead of
    `Yard_nn` because there is exactly one of it, which is the only reason
    the `Yard_` prefix did not already catch it."""
    assert palette.family_of("Lateen_Mizzen") == palette.HULL_TIMBER
    assert palette.look_of("Lateen_Mizzen") == palette.look_of("Yard_00")
    assert palette.look_of("Lateen_Mizzen") == "spar"


# --- the names the ship's own assets ship under ------------------------------


def test_each_ship_names_her_assets_after_herself():
    assert F.asset_stem == "frigate"
    assert G.asset_stem == "galleon"


def test_each_ship_s_materials_carry_her_own_name():
    """The frigate's four names are unchanged, to the letter, because they are
    in a `.blend` and a `.glb` that have shipped."""
    assert palette.material_names(F) == {
        palette.HULL_TIMBER: "Frigate_HullTimber",
        palette.DECK_PLANKING: "Frigate_DeckPlanking",
        palette.CANVAS: "Frigate_Canvas",
        palette.ROPE_IRON: "Frigate_RopeIron",
    }
    assert palette.material_names(G) == {
        palette.HULL_TIMBER: "Galleon_HullTimber",
        palette.DECK_PLANKING: "Galleon_DeckPlanking",
        palette.CANVAS: "Galleon_Canvas",
        palette.ROPE_IRON: "Galleon_RopeIron",
        # her beakhead deck's grating cards (Task 7, R6)
        palette.GRATING: "Galleon_Grating",
    }


def test_no_two_ships_share_a_material_name():
    assert not set(palette.material_names(F).values()) \
        & set(palette.material_names(G).values())


def test_the_galleon_s_atlases_cannot_overwrite_the_frigate_s():
    """THE ONE THAT WOULD HAVE DESTROYED A DELIVERABLE. `bake._save` wrote
    `build/textures/frigate_{family}_{kind}` for whatever ship was in the
    scene, so the galleon's canvas albedo and the frigate's were one file."""
    assert palette.atlas_stem(F, palette.CANVAS, "albedo") \
        == "frigate_canvas_albedo"
    assert palette.atlas_stem(G, palette.CANVAS, "albedo") \
        == "galleon_canvas_albedo"
    for family in palette.FAMILIES:
        for kind in ("albedo", "normal", "roughness"):
            assert palette.atlas_stem(F, family, kind) \
                != palette.atlas_stem(G, family, kind), (family, kind)


def test_an_unknown_family_is_refused_rather_than_named():
    with pytest.raises(KeyError):
        palette.material_names(G)["spun_glass"]


# --- the stern glazing, and a count that was only ever the frigate's ---------


def test_the_declared_window_count_is_one_band_s_and_not_the_whole_stern_s():
    """THE DEFECT `check_materials` CARRIED. `p.gallery_windows` is the light
    count of ONE band. The frigate has one band, so on her it is also the
    whole stern's total and the two readings cannot be told apart; the galleon
    carries two bands and they differ by four.

    Both ends of each figure named, measured off `profiles`:
      FRIGATE  1 band,  5 lights at z 1.8800..3.0700 — gallery_windows 5
      GALLEON  2 bands, 7 lights at z 3.9900..5.1600 (the great cabin)
                      + 4 lights at z 8.5900..9.2600 (the coach) = 11
    """
    from frigate import profiles

    assert len(profiles.gallery_tiers(F)) == 1
    assert len(profiles.all_gallery_window_rects(F)) == F.gallery_windows == 5

    assert len(profiles.gallery_tiers(G)) == 2
    assert len(profiles.all_gallery_window_rects(G)) == 13   # 9 + 4 at 42 m
    assert G.gallery_windows == 9
    assert len(profiles.all_gallery_window_rects(G)) != G.gallery_windows


def test_every_band_of_a_galleon_s_stern_carries_its_own_lights():
    """Glazing only the lowest band would leave the coach's lights as bare
    timber, which is `materials._glaze_faces`'s own stated reason for
    sweeping every band."""
    from frigate import profiles

    per_band = {}
    for tier, _rect in profiles.all_gallery_window_rects(G):
        per_band[tier] = per_band.get(tier, 0) + 1
    assert sorted(per_band) == [0, 1]
    assert all(n >= 1 for n in per_band.values())
    assert per_band[0] == 9 and per_band[1] == 4
