"""The paint scheme and the family table, under plain pytest. No bpy here."""

import pytest

from frigate import palette
from frigate.params import FrigateParams

P = FrigateParams()

# Every object the build emits, which is what `build.rebuild` returned on the
# commit this was written against. The point of listing them is that an object
# with NO material bakes as nothing, so the table must be total over the ship.
SHIP = (
    ["Hull", "Bulwarks", "Transom", "Stern_Gallery", "Stern_Carving", "Rails",
     "Channels", "Headrails", "Beakhead", "Figurehead", "Damage", "Masts",
     "Bowsprit", "Tops", "Deck_Main", "Deck_Forecastle", "Deck_Quarter",
     "Gratings", "Deck_Furniture", "Wheel", "Sails", "Sail_Patches",
     "Jolly_Roger", "Rigging", "Chainplates", "Rudder"]
    + [f"Yard_{i:02d}" for i in range(9)]
    + [f"PortLid_{i:02d}" for i in range(24)]
    + [f"Barrel_{i:02d}" for i in range(8)]
    + [f"Cannon_{i:02d}" for i in range(24)]
    + [f"Anchor_{i:02d}" for i in range(2)]
    + [f"Lantern_{i:02d}" for i in range(3)]
)


def test_the_ship_roster_is_the_96_objects_the_build_emits():
    """DERIVED, and every change to it stated. 86 at the texture pass, then:
    +1 `Rudder`; +8 for `Yards` becoming nine `Yard_nn`; +1 `Wheel` out of
    `Deck_Furniture`. 86 + 1 + 8 + 1 = 96."""
    assert len(SHIP) == 96
    assert len(set(SHIP)) == 96


def test_every_object_in_the_ship_lands_in_exactly_one_family():
    for name in SHIP:
        assert palette.family_of(name) in palette.FAMILIES


def test_all_four_families_are_actually_used():
    used = {palette.family_of(n) for n in SHIP}
    assert used == set(palette.FAMILIES)


def test_an_unknown_object_is_refused_rather_than_silently_given_the_hull():
    """A default would hand a new object the hull material and ship it. Worse,
    a typo would. The one thing this must never do is quietly succeed."""
    for bad in ("Longboat", "", "PortLid_", "PortLid_xx", "Cannon_01a", "hull"):
        with pytest.raises(KeyError):
            palette.family_of(bad)


def test_every_object_has_a_look_and_it_belongs_to_a_known_one():
    for name in SHIP:
        assert palette.look_of(name) in palette.LOOK
        assert palette.look_value(name) == palette.LOOK[palette.look_of(name)]


def test_only_the_planking_wears_the_painted_livery():
    """The livery is height-driven, so anything that stands above the hull must
    not wear it — a mast banded black where a wale happens to cross it is how a
    height-driven scheme goes wrong."""
    wearing = {n for n in SHIP if palette.wears_livery(n)}
    assert "Hull" in wearing and "Bulwarks" in wearing and "PortLid_00" in wearing
    for spar in ("Masts", "Yard_00", "Yard_08", "Bowsprit", "Tops", "Figurehead"):
        assert spar not in wearing
    for n in SHIP:
        if palette.family_of(n) != palette.HULL_TIMBER:
            assert not palette.wears_livery(n)


# --- colour ------------------------------------------------------------------


def test_the_measured_colours_are_the_ones_read_off_gardiner():
    """These four are measurements, not taste. If one changes, the pixel reading
    in the module docstring must change with it."""
    assert palette.OCHRE_STRAKE == (231, 193, 101)
    assert palette.BLUE_TRIM == (66, 102, 140)
    assert palette.BOTTOM == (205, 150, 110)


def test_the_wale_is_darker_than_the_glossy_jacket_photographed_it():
    """The one adopted colour that is not its measurement. The darkest wale
    pixel on the plate is (89,69,18) and the adopted value must be DARKER than
    that, never lighter — the correction is for specular lift off a printed
    jacket, and specular lift only ever makes a black lighter."""
    for adopted, measured in zip(palette.BLACK_WALE, (89, 69, 18)):
        assert adopted <= measured


def test_the_scheme_is_ochre_strakes_black_wales_and_blue_inboard_trim():
    """The three things the reference actually shows, as colour relationships
    rather than as numbers, so they survive a retint."""
    ochre, wale, blue = (
        palette.OCHRE_STRAKE, palette.BLACK_WALE, palette.BLUE_TRIM)
    assert sum(ochre) > 2 * sum(wale), "the strake must read far lighter than the wale"
    assert ochre[0] > ochre[1] > ochre[2], "ochre runs warm: R > G > B"
    assert blue[2] > blue[1] > blue[0], "the trim runs blue: B > G > R"
    assert sum(wale) < 150, "a wale is painted black"


def test_srgb_converts_to_linear_and_the_endpoints_are_exact():
    assert palette.srgb_to_linear((0, 0, 0)) == (0.0, 0.0, 0.0)
    assert palette.srgb_to_linear((255, 255, 255)) == pytest.approx((1.0, 1.0, 1.0))
    mid = palette.srgb_to_linear((128, 128, 128))[0]
    assert 0.21 < mid < 0.22, "sRGB 128 is linear ~0.216, not 0.502"


def test_a_measured_colour_is_always_darker_once_it_is_linear():
    """Setting a measured sRGB triple straight onto a shader socket is how a
    reference-matched palette ships washed out. Every channel must move down."""
    for c in (palette.OCHRE_STRAKE, palette.BLUE_TRIM, palette.BOTTOM,
              palette.DECK_PLANK, palette.CANVAS_CLOTH, palette.HEMP_ROPE):
        for raw, lin in zip(c, palette.srgb_to_linear(c)):
            assert lin < raw / 255.0


def test_an_out_of_range_channel_is_refused():
    with pytest.raises(ValueError):
        palette.srgb_to_linear((256, 0, 0))
    with pytest.raises(ValueError):
        palette.srgb_to_linear((-1, 0, 0))


# --- the bands ---------------------------------------------------------------


def test_every_band_has_a_colour_and_every_colour_a_band():
    assert set(palette.BANDS) == set(palette.BAND_COLOUR)


def _band(h, z, inboard=False):
    return palette.livery_band(h, z, P.bulwark_h, inboard)


def test_below_the_boot_top_the_hull_is_bottom_colour():
    assert _band(-4.0, -0.5) == "bottom"
    assert _band(-6.0, -4.4) == "bottom"


def test_the_boot_top_is_a_black_band_straddling_the_waterline():
    """It follows the WATERLINE, not the sheer, so the same absolute z gives the
    same answer at the stem as amidships even though h differs by metres."""
    assert _band(-4.2, 0.0) == "boot_top"
    assert _band(-6.4, 0.0) == "boot_top"
    assert palette.BAND_COLOUR["boot_top"] == palette.BLACK_WALE


def test_the_wale_follows_the_sheer_rather_than_the_waterline():
    """Same h at two very different absolute heights is still the wale. If the
    wale were placed in absolute z it would run off the planking at the bow."""
    assert _band(-0.5, 3.4) == "main_wale"
    assert _band(-0.5, 5.6) == "main_wale"
    assert _band(-1.2, 3.0) == "ochre_strake"


def test_the_top_of_the_bulwark_is_black_whichever_side_you_look_at():
    """The rail cap is a capping timber: it is painted on both faces, so the cap
    band has to be tested BEFORE the inboard blue or the inboard half of the cap
    comes out blue."""
    top = P.bulwark_h - 0.01
    assert _band(top, 5.0) == "cap_band"
    assert _band(top, 5.0, inboard=True) == "cap_band"


def test_inboard_above_the_deck_edge_is_blue_and_outboard_is_ochre():
    h = 0.6
    assert _band(h, 4.8, inboard=True) == "blue_trim"
    assert _band(h, 4.8, inboard=False) == "ochre_strake"


def test_below_the_deck_edge_there_is_no_blue_however_the_face_points():
    """Blue is inboard TRIM — the inside of the bulwark. Below the deck edge
    there is no inside, and an inward-pointing normal down there is a tumblehome
    face or a scar, not a bulwark."""
    assert _band(-1.5, 2.8, inboard=True) == "ochre_strake"
    assert _band(-0.5, 3.4, inboard=True) == "main_wale"


def test_the_bands_are_contiguous_from_the_keel_to_the_cap():
    """Walk the whole side of the ship and make sure no height falls through
    into something unnamed, and that the order down the side is the order the
    draughts show: cap, blue-or-ochre, wale, ochre, boot top, bottom."""
    seen = []
    z = 5.6
    h = P.bulwark_h
    while h > -6.0:
        b = palette.livery_band(h, z, P.bulwark_h, False)
        assert b in palette.BANDS
        if not seen or seen[-1] != b:
            seen.append(b)
        h -= 0.01
        z -= 0.01
    assert seen == ["cap_band", "ochre_strake", "main_wale", "ochre_strake",
                    "boot_top", "bottom"]


def test_a_bulwark_too_short_for_its_own_cap_band_is_refused():
    with pytest.raises(ValueError):
        palette.livery_band(0.0, 4.0, palette.CAP_BAND, False)


# --- the rope ribbons --------------------------------------------------------


def test_the_rope_alpha_cuts_both_edges_of_the_ribbon_away():
    assert palette.rope_alpha(0.0) == 0.0
    assert palette.rope_alpha(1.0) == 0.0
    assert palette.rope_alpha(0.5) == 1.0


def test_the_cut_is_symmetric_about_the_ribbon_centre():
    for u in (0.0, 0.05, 0.2, 0.25, 0.4, 0.5):
        assert palette.rope_alpha(u) == palette.rope_alpha(1.0 - u)


def test_the_surviving_ribbon_is_a_bit_over_half_its_width():
    """Cut too little and it is still tape; cut too much and the rig vanishes at
    distance. Both ends of that span are named rather than left to taste."""
    kept = 1.0 - 2.0 * palette.ROPE_ALPHA_CUT
    assert 0.45 < kept < 0.70


def test_the_rope_reads_round_rather_than_flat():
    """Zero at both cut edges, one on the centre line, and monotonic between —
    a circular profile, which is what makes a flat quad read as rope."""
    assert palette.rope_round_offset(palette.ROPE_ALPHA_CUT) == 0.0
    assert palette.rope_round_offset(1.0 - palette.ROPE_ALPHA_CUT) == 0.0
    assert palette.rope_round_offset(0.5) == pytest.approx(1.0)
    us = [palette.ROPE_ALPHA_CUT + 0.01 * i for i in range(1, 26)]
    vals = [palette.rope_round_offset(u) for u in us]
    assert all(b >= a for a, b in zip(vals, vals[1:])), "must rise to the centre"


def test_nothing_outside_the_cut_stands_proud():
    for u in (0.0, 0.1, palette.ROPE_ALPHA_CUT - 1e-9, 1.0):
        assert palette.rope_round_offset(u) == 0.0


# --- the surface response ----------------------------------------------------


def test_every_family_declares_a_clean_and_a_worn_roughness_in_that_order():
    assert set(palette.ROUGHNESS) == set(palette.ALL_FAMILIES)
    for family, (clean, worn) in palette.ROUGHNESS.items():
        assert 0.0 < clean < worn <= 1.0, family


def test_the_glass_is_the_only_smooth_thing_on_the_ship():
    """Everything else on a pirate frigate is salt-scoured. If the glazing ever
    stops being the smoothest surface, something has been polished by accident."""
    assert palette.GLAZING_ROUGHNESS < min(c for c, _ in palette.ROUGHNESS.values())


def test_the_single_sided_sheets_are_declared_double_sided():
    """Nine sails and 741 rope ribbons are one-layer geometry. Without this the
    exporter writes single-sided glTF materials and half the rig vanishes."""
    assert palette.CANVAS in palette.DOUBLE_SIDED
    assert palette.ROPE_IRON in palette.DOUBLE_SIDED
