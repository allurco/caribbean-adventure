"""The galleon's lateen canvas, and the spar it is actually bent to. No bpy.

A lateen's luff IS its yard — `shiptype._DEGENERATE` says the sail is
degenerate at the tack for exactly that reason, and `sailplan.spar_segments`
returns `(LATEEN_YARD, tack, peak)`, which asserts the identity outright.

Nothing enforced it. `profiles.lateen_spar` derives the timber that
`masts.build_lateen_yards` cuts, from `shiptype.LateenSpar`; `_lateen_corners`
derived the canvas from constants of its own. Measured before this file
existed: the built yard ran 16.173 m at 52 degrees from heel (0, -7.588,
7.382) to peak (0, -17.545, 20.127), while the sail's luff ran 11.609 m at 48
degrees from tack (0, -6.316, 10.929) to peak (0, -14.084, 19.556) — the two
heels 3.768 m apart and the two peaks 3.508 m. The canvas hung beside its own
spar.

One spar. `profiles.lateen_spar` is it, because that is the one that is CUT.
"""

import math

import pytest

from frigate import profiles, sailplan
from frigate import shiptype as st
from frigate.params import GalleonParams

G = GalleonParams()
MIZZEN = "mizzen"


def lateen_sail():
    (sail,) = [s for s in G.rig.mast(MIZZEN).sails
               if s.kind is st.SailKind.LATEEN]
    return sail


def test_the_lateen_luff_is_the_yard_that_is_actually_cut():
    """Tack and peak stand ON the spar `masts.build_lateen_yards` builds."""
    heel, _slings, peak, _r = profiles.lateen_spar(G, MIZZEN)
    c = sailplan.corners(G, MIZZEN, lateen_sail())
    assert c.tack == pytest.approx(heel, abs=1e-9)
    assert c.peak == pytest.approx(peak, abs=1e-9)


def test_the_canvas_head_and_the_spar_are_the_same_length():
    """The HEAD, throat to peak -- not the luff.

    `SailCorners.luff_length` is tack to throat, and a lateen is degenerate
    at the tack, so its luff is zero by construction and an assertion on it
    passes against anything. The edge the yard IS is throat-to-peak, which
    `SailCorners` calls the head. Watched failing as `0.0 != 16.173` before
    it was corrected; that is why this test is named for the head.
    """
    c = sailplan.corners(G, MIZZEN, lateen_sail())
    assert c.luff_length() == pytest.approx(0.0, abs=1e-12)
    assert c.head_length() == pytest.approx(
        profiles.lateen_length(G, MIZZEN), abs=1e-9)


def test_spar_segments_hands_back_the_spar_the_mast_pass_cut():
    """`spar_segments` claims the sail's tack-to-peak IS the lateen yard.
    It is only true if both come from `profiles.lateen_spar`."""
    heel, _slings, peak, _r = profiles.lateen_spar(G, MIZZEN)
    (kind, a, b), = sailplan.spar_segments(G, MIZZEN, lateen_sail())
    assert kind is st.SparKind.LATEEN_YARD
    assert a == pytest.approx(heel, abs=1e-9)
    assert b == pytest.approx(peak, abs=1e-9)


# --- the CLEW: the one corner no spar gives ---------------------------------
#
# Station first, then height, so there is no circularity. The clew stands
# `LATEEN_FOOT_FRAC` of the YARD'S OWN HORIZONTAL RUN aft of the tack, and
# `LATEEN_CLEW_CLEAR` above the rail cap at THAT station — its own, not the
# tack's and not the taffrail's.
#
# tack y -7.669 -> peak y -17.711, horizontal run 10.042 m. At 0.78 of it the
# clew stands at y -15.502, station t 0.9559, which is over the POOP. The rail
# cap there is 11.224 m above the waterline. (On the spar as built before the
# lateen was shortened to clear the poop's break the run was 9.957, the clew
# y -15.354 at t 0.9516 and the cap 11.172.) Before DEFECT 2 was fixed the
# same reader answered 9.572 — the quarterdeck's cap, 1.600 m low — which is
# why the clew had to be derived after that fix and not before it.

def test_the_clew_stands_a_named_fraction_of_the_yards_RUN_aft_of_the_tack():
    """TACK to CLEW, measured horizontally, as a fraction of TACK to PEAK.

    The clew is placed by STATION: `LATEEN_FOOT_FRAC` of the yard's
    horizontal RUN aft of the tack, because what is wanted is the station
    the sheet is belayed at. Its height is then read at that station.
    """
    c = sailplan.corners(G, MIZZEN, lateen_sail())
    run = c.tack[1] - c.peak[1]
    assert run == pytest.approx(10.042, abs=0.001)
    assert c.clew[1] == pytest.approx(
        c.tack[1] - sailplan.LATEEN_FOOT_FRAC * run, abs=1e-9)
    assert c.clew[1] == pytest.approx(-15.502, abs=0.001)
    # Forward of the peak, which overhangs the taffrail, so the sheet comes
    # down INBOARD where it can be belayed.
    assert c.clew[1] > c.peak[1]
    assert c.clew[1] > profiles.station_y(G, 1.0)


def test_the_clew_clears_the_rail_cap_at_ITS_OWN_station():
    """CLEW to RAIL CAP, both at station t 0.9559, over the poop.

    Not at the tack's station and not at the taffrail: the sheer sweeps up
    aft and the poop stands 5.00 m over the gun deck, so the cap under the
    clew is 11.224 m above the waterline where the cap at the mizzen is far
    lower. The clew stands `LATEEN_CLEW_CLEAR` above it.
    """
    c = sailplan.corners(G, MIZZEN, lateen_sail())
    t_clew = profiles.t_of_y(G, c.clew[1])
    assert t_clew == pytest.approx(0.9559, abs=0.0005)
    cap = profiles.rail_top_z(G, t_clew)
    assert cap == pytest.approx(11.224, abs=0.001)
    assert c.clew[2] == pytest.approx(cap + sailplan.LATEEN_CLEW_CLEAR, abs=1e-9)
    assert c.clew[2] == pytest.approx(12.424, abs=0.001)
    # It is the POOP's cap that governs, which is DEFECT 2's fix in evidence.
    assert profiles._rail_tier_at(G, t_clew).name == "Deck_Poop"
    assert cap - profiles.sheer(G, t_clew) == pytest.approx(6.00, abs=1e-9)
    # Under its own peak, or the leech would run the wrong way.
    assert c.clew[2] < c.peak[2]


def test_the_lateen_triangle_is_not_degenerate_anywhere_but_the_tack():
    """Three real edges, and the HEAD is the longest, which is a lateen."""
    c = sailplan.corners(G, MIZZEN, lateen_sail())
    sailplan.check_degeneracy(st.SailKind.LATEEN, c)
    assert c.luff_length() == pytest.approx(0.0, abs=1e-12)
    assert c.foot_length() > 1.0
    assert c.leech_length() > 1.0
    assert c.head_length() > c.foot_length()
    assert c.head_length() > c.leech_length()
    # A real plane, so the canvas has somewhere to belly to.
    n = c.plane_normal()
    assert all(math.isfinite(co) for co in n)
    assert abs(n[0]) == pytest.approx(1.0, abs=1e-9), \
        "the sail lies in the ship's fore-and-aft plane"
