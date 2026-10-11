"""The beakhead deck's GRATINGS: their own material family and the alpha
mask that cuts the holes. No bpy.

The maintainer's ruling (2026-10-05): the floor of the beakhead deck is a grating,
drawn as an alpha-masked CARD rather than modelled bars, to keep the
~2,000-triangle grid out of the rails line. The controller's R6 gives the
cards a family of their OWN, so the alpha channel they need does not drag
the deck planking's albedo atlas to PNG with it.

Both endpoints of every figure: GRATING_PITCH is one bar's near edge to
the next bar's near edge; GRATING_BAR is one bar's near edge to its own
far edge; both measured along the card in metres.
"""

from frigate import palette
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()


def test_the_gratings_are_a_family_of_their_own():
    assert palette.GRATING not in palette.FAMILIES
    assert palette.GRATING in palette.ALL_FAMILIES
    assert palette.family_of("Beakhead_Grating") == palette.GRATING
    assert palette.look_of("Beakhead_Grating") == "grating"


def test_only_a_ship_with_a_beakhead_deck_carries_the_family():
    """The frigate's four, verbatim: her material count, atlas count and
    check_all keys must not move."""
    assert palette.families(F) == palette.FAMILIES
    assert palette.families(G) == palette.FAMILIES + (palette.GRATING,)


def test_the_family_is_named_shaded_and_double_sided_like_the_others():
    assert palette.material_names(G)[palette.GRATING] == "Galleon_Grating"
    assert palette.atlas_stem(G, palette.GRATING, "albedo") \
        == "galleon_grating_albedo"
    clean, worn = palette.ROUGHNESS[palette.GRATING]
    assert 0.0 < clean < worn <= 1.0
    assert palette.GRATING in palette.DOUBLE_SIDED


def test_the_pitch_leaves_a_real_hole_between_two_bars():
    assert 0.0 < palette.GRATING_BAR < palette.GRATING_PITCH
    hole = palette.GRATING_PITCH - palette.GRATING_BAR
    # a hole a heel cannot go through, and a bar wider than a texel
    assert 0.02 <= hole <= 0.08


def test_the_alpha_is_one_on_a_bar_and_zero_in_a_hole():
    pitch, bar = palette.GRATING_PITCH, palette.GRATING_BAR
    mid_hole = bar + 0.5 * (pitch - bar)
    assert palette.grating_alpha(mid_hole, mid_hole) == 0.0
    assert palette.grating_alpha(0.5 * bar, mid_hole) == 1.0
    assert palette.grating_alpha(mid_hole, 0.5 * bar) == 1.0
    # periodic, both ways
    assert palette.grating_alpha(mid_hole + 3 * pitch,
                                 mid_hole - 2 * pitch) == 0.0


def test_the_mask_cuts_texels_away():
    """The ruling's whole point: some of the card is NOT there. Sampled
    over one pitch square, the open fraction is the holes' own area."""
    n = 200
    pitch = palette.GRATING_PITCH
    cut = sum(palette.grating_alpha(pitch * (i + 0.5) / n,
                                    pitch * (j + 0.5) / n) == 0.0
              for i in range(n) for j in range(n))
    hole = (pitch - palette.GRATING_BAR) / pitch
    assert cut > 0
    assert abs(cut / n ** 2 - hole ** 2) < 0.02


# --- the bake's cut, read back against the cards ---------------------------


def test_each_cards_open_fraction_is_its_holes_share_of_its_area():
    """Measured per card, exactly along each row: a card spanning whole
    pitches would be open hole^2 = 0.36; a real card's edges fall where
    they fall, so each reads near that, not on it."""
    from frigate import head
    cards = head.beakhead_grating_open_fractions(G)
    assert len(cards) == len(head.beakhead_grating_cards(G))
    hole = (palette.GRATING_PITCH - palette.GRATING_BAR) \
        / palette.GRATING_PITCH
    for area, perimeter, f in cards:
        assert area > 0.0 and perimeter > 0.0
        assert 0.0 < f < 1.0
    total = sum(a for a, _p, _f in cards)
    mean = sum(a * f for a, _p, f in cards) / total
    assert abs(mean - hole ** 2) < 0.08, mean
    assert head.beakhead_grating_open_fractions(F) == []


def test_the_bake_key_holds_the_cut_to_the_cards_and_its_margin():
    """`check_bake`'s grating key, pure. The cut texels over the covered
    ones must lie where the cards' open fraction puts them, give or take
    the bake margin's ring round each island (any value) and one texel
    at every bar edge."""
    from frigate import checklist
    covered = 600_000
    key, ok = checklist.grating_cut_result(G, 216_000, covered, 8)
    assert ok, key
    assert "grating" in key and "216000 of 600000" in key
    for cut in (0, covered, int(0.64 * covered)):
        assert not checklist.grating_cut_result(G, cut, covered, 8)[1], cut
