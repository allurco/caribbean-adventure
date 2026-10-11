"""The galleon's masts, yards and the one spar the frigate never had. No bpy.

The galleon's rig is square forward and LATEEN on the mizzen, which is the
single thing that most distinguishes it from the frigate's. That has three
consequences the frigate could never have found, and all three are here:

  a mast that sets no square sail carries NO FIGHTING TOP, because there is
    no yard to work from;
  a mast that sets no square sail carries NO SQUARE YARDS, so "three to a
    mast" is a fact about the frigate's rig and not about yards;
  a lateen mast carries ONE LONG RAKING SPAR instead, lying in the ship's
    fore-and-aft plane with its heel low and forward and its peak high and
    aft, and it is as long as the mast it crosses.
"""

import math

import pytest

from frigate import profiles, rig
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


# --- how many of each ------------------------------------------------------

def test_the_frigate_tops_every_mast_and_the_galleon_only_its_square_ones():
    assert profiles.tops_on(F) == ("fore", "main", "mizzen")
    assert profiles.tops_on(G) == ("fore", "main")
    assert profiles.top_span(G, "mizzen") == 0.0


def test_the_yard_count_is_read_off_the_rig_and_not_written_down():
    """It was `range(YARD_TIERS)` — three a mast, always, which is the
    frigate's nine written as a loop."""
    assert len(rig.yard_order(F)) == 9
    assert [n for n, _t in rig.yard_order(F)].count("mizzen") == 3
    # The galleon sets two square sails on its fore, three on its main and a
    # lateen on its mizzen: five square yards, not nine.
    assert len(rig.yard_order(G)) == 5
    assert [n for n, _t in rig.yard_order(G)] == \
        ["fore", "fore", "main", "main", "main"]
    assert profiles.yard_specs(G, "mizzen") == []


def test_every_yard_still_gets_a_pivot_on_its_own_mast():
    for p in (F, G):
        pivots = rig.yard_pivots(p)
        assert len(pivots) == len(rig.yard_order(p))
        for (name, tier), pivot in zip(rig.yard_order(p), pivots):
            z, _length, _r = profiles.yard_specs(p, name)[tier]
            assert pivot.point == pytest.approx(
                profiles.mast_point(p, name, z), abs=1e-12)


# --- the lateen yard -------------------------------------------------------

def test_only_the_galleon_sets_a_lateen_and_only_on_its_mizzen():
    assert profiles.lateen_masts(F) == ()
    assert profiles.lateen_masts(G) == ("mizzen",)


def test_the_lateen_yard_is_as_long_as_the_mast_it_crosses():
    """HEEL to PEAK along the spar, against MAST-FOOT to MAST-TRUCK.

    13.96 m of yard on 17.02 m of mast, which is 0.82 — still most of the
    mast, which is what makes a lateen mizzen look like a lateen mizzen
    rather than a bare pole with a triangle on it. It was 16.17 m (0.95)
    until the yard was shortened so its foot clears the poop's break; see
    `tests/test_lateen_clears_the_poop.py`. The frigate's longest yard is
    her main course at 14.79 m, on a 36.0 m mainmast.
    """
    foot = profiles.mast_foot(G, "mizzen")
    span = profiles.mast_truck_z(G, "mizzen") - foot[2]
    assert span == pytest.approx(17.02, abs=0.02)
    assert profiles.lateen_length(G, "mizzen") == pytest.approx(
        13.96, abs=0.02)
    assert profiles.lateen_length(G, "mizzen") / span == \
        pytest.approx(G.rig.lateen.length_frac, abs=1e-9)


def test_the_lateen_yard_lies_fore_and_aft_with_its_peak_AFT_and_UP():
    """Every endpoint named. HEEL at (y 7.59 forward of the taffrail... )

    Stated against the ship's own landmarks: the heel stands at y = -7.67 m
    and z = 10.34 m above the waterline, the slings cross the mizzen at
    y = -10.68, z = 13.25, and the peak reaches y = -17.71, z = 20.04. The
    taffrail is at y = -17.00, so the peak overhangs it by 0.71 m, which is
    what a lateen peak does.
    """
    heel, slings, peak, radius = profiles.lateen_spar(G, "mizzen")
    assert heel == pytest.approx((0.0, -7.67, 10.34), abs=0.02)
    assert peak == pytest.approx((0.0, -17.71, 20.04), abs=0.02)
    assert peak[1] < slings[1] < heel[1]      # peak aft, heel forward
    assert peak[2] > slings[2] > heel[2]      # peak up, heel down
    # radius_frac 0.013 of a 13.96 m yard (was 0.21 on 16.17 m)
    assert radius == pytest.approx(0.18, abs=0.01)
    # It rakes at its stated angle above the horizontal.
    rake = math.degrees(math.atan2(peak[2] - heel[2], heel[1] - peak[1]))
    assert rake == pytest.approx(G.rig.lateen.rake_deg, abs=0.01)
    # And it overhangs the taffrail, as a lateen peak does.
    assert peak[1] < -G.half_loa


def test_the_slings_sit_on_the_mizzens_own_RAKED_axis():
    """Not on a vertical through its foot: the mizzen rakes 3 degrees aft."""
    _heel, slings, _peak, _r = profiles.lateen_spar(G, "mizzen")
    assert slings == pytest.approx(
        profiles.mast_point(G, "mizzen", slings[2]), abs=1e-12)
    foot = profiles.mast_foot(G, "mizzen")
    assert slings[1] != pytest.approx(foot[1], abs=1e-3)   # it HAS raked


def test_the_peak_stays_under_its_own_truck_and_the_heel_over_its_own_deck():
    """Two clearances, both endpoints of each named.

    PEAK to MIZZEN TRUCK is 1.04 m (was 0.95) — a yard whose peak stood over
    its own masthead would have nothing to hoist it by. HEEL to QUARTERDECK
    AT THE HEEL'S OWN STATION is 3.26 m (was 0.31) — a yard heel inside the
    deck it is hoisted over is a yard through the deck.
    """
    heel, _slings, peak, _r = profiles.lateen_spar(G, "mizzen")
    truck = profiles.mast_truck_z(G, "mizzen")
    assert truck - peak[2] == pytest.approx(1.04, abs=0.03)
    assert peak[2] < truck

    t = profiles.t_of_y(G, heel[1])
    deck = profiles.deck_z_at(G, t, 0.0, G.quarter_rise)
    assert heel[2] - deck == pytest.approx(3.26, abs=0.03)
    assert heel[2] > deck


# --- the lateen yard's PIVOT: the same invariant a square yard satisfies ----
#
# `rig.yard_pivots` gives every SQUARE yard a pivot at its own slings, turning
# about its own mast's raked axis. The lateen yard was a STATIC node — ledger
# open item 11 — and its pivot is the same joint: the SLINGS, which
# `profiles.lateen_spar` already returns as its second element and which
# `joints.py` already names as the joint `Lateen_Mizzen` makes to `Masts`.


def test_the_lateen_yard_pivots_on_its_own_slings_like_every_square_yard():
    """SLINGS, on the mizzen's own raked axis. Not the heel, not the mast foot.

    The square yards' invariant, word for word: the pivot point is ON its own
    mast's axis — the mast's FOOT and its TRUCK both lie on the line the
    pivot turns about — and it turns about that raked axis and not the world
    vertical.
    """
    pivots = rig.lateen_pivots(G)
    assert [piv.part for piv in pivots] == ["Lateen_Mizzen"]
    (piv,) = pivots
    _heel, slings, _peak, _r = profiles.lateen_spar(G, "mizzen")
    assert piv.point == pytest.approx(slings, abs=1e-12)
    assert piv.axis == pytest.approx(rig.mast_axis(G, "mizzen"), abs=1e-12)
    # ON the mast axis, proved against geometry that did not place it.
    assert piv.distance_from(profiles.mast_foot(G, "mizzen")) == \
        pytest.approx(0.0, abs=1e-9)
    assert piv.distance_from(profiles.mast_point(
        G, "mizzen", profiles.mast_truck_z(G, "mizzen"))) == \
        pytest.approx(0.0, abs=1e-9)
    # And NOT on either of the other two masts.
    for other in ("fore", "main"):
        assert piv.distance_from(profiles.mast_foot(G, other)) > 5.0
    # The raked axis, which is the whole reason it is not the vertical.
    assert rig.axis_error_deg(piv.axis, (0.0, 0.0, 1.0)) == pytest.approx(
        profiles.mast_rake_deg(G, "mizzen"), abs=1e-6)


def test_a_ship_that_sets_no_lateen_gets_no_lateen_pivot():
    assert rig.lateen_pivots(F) == []


def test_the_lateen_yard_is_ANIMATABLE_and_was_a_static_node():
    """It is in the pivot table, so `gltf` gives it an origin and an axis."""
    assert "Lateen_Mizzen" in rig.animatable_parts(G)
    assert "Lateen_Mizzen" not in rig.animatable_parts(F)
    # One more animatable part than the five square yards, the lids, the
    # wheel and the rudder.
    assert len(rig.animatable_parts(G)) == len(rig.pivots(G, 1.0))


@pytest.mark.parametrize("kwargs, match", [
    (dict(length_frac=0.0), "length_frac"),
    (dict(slings_frac=1.0), "ALONG itself"),
    (dict(mast_frac=1.2), "mast_frac"),
    (dict(rake_deg=0.0), "RAKES"),
    (dict(rake_deg=95.0), "RAKES"),
    (dict(tip_taper=1.4), "tapers towards its ends"),
])
def test_a_lateen_spar_that_could_not_be_built_is_refused(kwargs, match):
    with pytest.raises(ValueError, match=match):
        st.LateenSpar(**kwargs).validate()


def test_the_bowsprit_steeves_harder_on_the_galleon_and_clears_its_head():
    """BOWSPRIT at the STEM to the RAIL CAP AT THE STEM: it must already be
    over the rail, or the spar runs through the head timbers instead of over
    them. The galleon steeves 32 degrees against the frigate's 24."""
    for p in (F, G):
        heel, tip, _r0, _r1 = profiles.bowsprit_segment(p)
        y_stem = profiles.station_y(p, 0.0)
        f = (y_stem - heel[1]) / (tip[1] - heel[1])
        z_at_stem = heel[2] + f * (tip[2] - heel[2])
        assert z_at_stem > profiles.sheer(p, 0.0) + p.bulwark_h
    assert G.rig.bowsprit.steeve_deg > F.rig.bowsprit.steeve_deg
