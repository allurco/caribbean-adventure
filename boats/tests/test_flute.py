"""The flute (fluyt): a Dutch cargo carrier, pirate-converted.

What makes a fluyt a fluyt, against the frigate and the galleon, with both
endpoints of every figure named:

  * a LONG, NARROW hull for her size: stem-at-the-rail to taffrail over the
    maximum beam about 4 : 1 (fluyts ran 4 : 1 to 6 : 1 between
    perpendiculars), where the galleon is 3.09 : 1 and the frigate 3.73 : 1;
  * a PEAR-SHAPED section: the topsides draw in far harder than either
    other hull's, so the deck is narrow over a wide bilge (the Sound toll was
    levied on deck width);
  * a NARROW, HIGH, ROUNDED stern: the run takes most of the width off by
    the taffrail and the stern stands high over a round tuck;
  * three masts, square on the fore and main with SHORT topmasts (no
    topgallants) and a lateen mizzen, and only a few light guns.
"""

import pytest

from frigate import profiles, shiptype as st
from frigate.params import FluteParams, FrigateParams, GalleonParams

L = FluteParams()
F = FrigateParams()
G = GalleonParams()


def test_she_is_a_ship_type_of_her_own_with_her_own_collection():
    assert L.collection == "Flute"
    assert L.asset_stem == "flute"
    L.validate()


def test_stem_at_rail_to_taffrail_lies_in_the_25_to_35_metre_class():
    assert 25.0 <= L.loa <= 35.0
    assert L.loa == 30.0


def test_she_is_longer_and_narrower_for_her_beam_than_both_other_hulls():
    ratio = L.loa / L.beam
    assert ratio == pytest.approx(4.05, abs=0.01)
    assert ratio > F.loa / F.beam > G.loa / G.beam


def test_her_topsides_draw_in_harder_than_the_galleons():
    """The pear: half-width at the deck edge over half-width at the
    waterline, amidships, is smaller than the galleon's."""
    def pinch(p):
        t = p.max_beam_t
        sz = profiles.sheer(p, t)
        return (profiles.half_beam(p, t) * profiles.tumblehome(p, sz, sz)
                / profiles.half_beam(p, t))
    assert pinch(L) < pinch(G) < pinch(F)
    assert pinch(L) == pytest.approx(0.70, abs=0.005)


def test_her_stern_is_narrower_than_either_other_hulls_at_the_taffrail():
    """Half-beam at station 1.0 over the maximum half-beam."""
    def stern(p):
        return profiles.half_beam(p, 1.0) / p.half_beam
    assert stern(L) < stern(G)
    assert stern(L) < stern(F)
    assert stern(L) == pytest.approx(0.32, abs=0.005)


def test_her_stern_stands_high_over_her_waist():
    """WAIST-RAIL-CAP amidships to the highest rail cap at the taffrail:
    a fluyt's stern stands well over her waist, as the galleon's does and
    the flush frigate's does not."""
    def rise(p):
        waist = profiles.sheer(p, 0.5) + p.bulwark_h
        return profiles.rail_top_z(p, 1.0) - waist
    assert rise(L) > 3.0 > rise(F)


def test_three_masts_square_forward_and_a_lateen_mizzen():
    assert L.rig.mast_names() == ("fore", "main", "mizzen")
    assert L.rig.lateen_masts() == ("mizzen",)
    for name in ("fore", "main"):
        kinds = [s.kind for s in L.rig.mast(name).sails]
        assert kinds == [st.SailKind.SQUARE, st.SailKind.SQUARE]


def test_she_is_lightly_armed():
    ports = profiles.total_broadside_ports(L)
    assert ports < profiles.total_broadside_ports(F) / 2
    assert len(L.gun_decks) == 1 and L.gun_decks[0].host == "bulwark"
