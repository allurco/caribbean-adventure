"""The Minerva figurehead: the carving arithmetic, under plain pytest.

Everything here is the SHAPE of the carving, which is pure trigonometry, so it
is testable without Blender. `frigate.dressing` only emits what these functions
return. The one number the whole carving hangs off is quoted with both of its
endpoints named: heel-ring-centre to helmet-crown-apex.
"""

import math

import pytest

from frigate.params import FrigateParams
from frigate import profiles


@pytest.fixture
def p():
    return FrigateParams()


def _radii(ring, axis_pt, up):
    """Perpendicular distance of each ring point from the figure's own axis."""
    out = []
    for pt in ring:
        d = [a - b for a, b in zip(pt, axis_pt)]
        along = sum(a * b for a, b in zip(d, up))
        perp = [a - along * b for a, b in zip(d, up)]
        out.append(math.sqrt(sum(c * c for c in perp)))
    return out


# --- the fold function itself ----------------------------------------------


def test_a_fold_ring_with_no_amplitude_is_a_plain_ellipse():
    ring = profiles.fold_ring(24, 0.30, 0.22, 0.0, 12)
    for i, (a, b) in enumerate(ring):
        angle = 2 * math.pi * i / 24
        assert a == pytest.approx(0.30 * math.cos(angle))
        assert b == pytest.approx(0.22 * math.sin(angle))


def test_the_fold_crests_and_troughs_land_exactly_on_vertices():
    """FIG_SIDES == 2 * FIG_FOLDS, so cos(N*theta) is +-1 at every vertex and no
    fold is sampled on its flank, where it would read as a wobble not a flute."""
    assert profiles.FIG_SIDES == 2 * profiles.FIG_FOLDS
    ring = profiles.fold_ring(profiles.FIG_SIDES, 1.0, 1.0, 0.2, profiles.FIG_FOLDS)
    for i, (a, b) in enumerate(ring):
        want = 1.2 if i % 2 == 0 else 0.8
        assert math.hypot(a, b) == pytest.approx(want)


def test_a_fold_ring_is_closed_and_symmetric_across_the_centreline():
    ring = profiles.fold_ring(24, 0.30, 0.22, 0.15, 12)
    assert len(ring) == 24
    for i in range(1, 12):
        assert ring[i][0] == pytest.approx(ring[-i][0])
        assert ring[i][1] == pytest.approx(-ring[-i][1])


# --- the carving's scale, both endpoints named ------------------------------


def test_heel_ring_centre_to_helmet_crown_apex_is_the_scale_the_draughts_support(p):
    """Gardiner's three sheer draughts put a frigate's figurehead at roughly the
    height of a man: 1.5-1.8 m, i.e. 0.35-0.42 of waterline-to-rail-cap at the
    station of maximum beam. The old lofted tube ran ~2.7 m on its own axis."""
    height = profiles.figure_height(p)
    rail_cap = profiles.sheer(p, p.max_beam_t) + p.bulwark_h
    assert 1.5 <= height <= 1.8
    assert 0.35 <= height / rail_cap <= 0.42


def test_the_carving_leans_forward_of_the_stem_and_clears_the_bowsprit(p):
    lo, hi = profiles.figure_bounds(p)
    y_stem = profiles.station_y(p, 0.0)
    heel, tip, _r0, _r1 = profiles.bowsprit_segment(p)
    f = (hi[1] - heel[1]) / (tip[1] - heel[1])
    assert hi[1] > y_stem + 1.0
    assert hi[2] < heel[2] + f * (tip[2] - heel[2]) - 0.5
    assert lo[2] > 0.0


def test_the_carving_straddles_the_centreline_inside_the_half_metre_band(p):
    lo, hi = profiles.figure_bounds(p)
    assert lo[0] < 0.0 < hi[0]
    assert hi[0] < 0.6 and lo[0] > -0.6


# --- the drapery, which is the point ----------------------------------------


def _relief(radii):
    """Fold depth, measured CREST TO ADJACENT TROUGH rather than ring-max to
    ring-min. The body is an ellipse before it is fluted, and a max-to-min
    spread measures that ellipse far more than it measures the carving: at the
    hem it reads 0.63 of which only 0.36 is fold. Neighbouring vertices sit on
    the same part of the ellipse, so differencing them leaves the fold alone.
    """
    mean = sum(radii) / len(radii)
    steps = [abs(radii[i] - radii[(i + 1) % len(radii)]) for i in range(len(radii))]
    return (sum(steps) / len(steps)) / mean


def test_the_drapery_folds_deepen_from_the_collar_to_the_hem(p):
    """A carved robe is shallow at the throat and deep at the skirt."""
    _heel, up, _fwd = profiles.figure_axis(p)
    axis = profiles.figure_point(p, 0.0, 0.0, 0.0)
    rings = profiles.figure_body_rings(p)
    hem = _relief(_radii(rings[profiles.FIG_HEM_RING], axis, up))
    collar = _relief(_radii(rings[profiles.FIG_COLLAR_RING], axis, up))
    assert hem > 0.20
    assert hem > collar * 1.5


def test_every_body_ring_below_the_throat_is_carved_not_turned(p):
    """A lathe-turned tube has every radius equal. Only the throat may."""
    _heel, up, _fwd = profiles.figure_axis(p)
    axis = profiles.figure_point(p, 0.0, 0.0, 0.0)
    rings = profiles.figure_body_rings(p)
    for ring in rings[1:-1]:
        r = _radii(ring, axis, up)
        assert max(r) - min(r) > 1e-3


def test_the_hem_is_the_widest_part_of_the_robe(p):
    _heel, up, _fwd = profiles.figure_axis(p)
    axis = profiles.figure_point(p, 0.0, 0.0, 0.0)
    rings = profiles.figure_body_rings(p)
    widest = max(range(len(rings)),
                 key=lambda i: max(_radii(rings[i], axis, up)))
    assert widest == profiles.FIG_HEM_RING


# --- helmet, shield and spear ----------------------------------------------


def test_the_helmet_crown_is_the_highest_point_and_stands_forward_of_the_shoulders(p):
    crown = profiles.figure_crown(p)
    shoulder = profiles.figure_body_rings(p)[profiles.FIG_SHOULDER_RING]
    lo, hi = profiles.figure_bounds(p)
    assert crown[2] == pytest.approx(hi[2], abs=1e-9)
    assert crown[1] > max(pt[1] for pt in shoulder)


def test_the_head_is_tilted_up_so_the_chin_leads_the_crown(p):
    """Tornstrom's Minerva looks up and forward: the jaw stands out ahead of the
    skull, measured as facing-offset at the jaw ring against the crown ring."""
    rings = profiles.FIG_HEAD
    jaw = next(r for r in rings if r[0] == "jaw")
    crown = next(r for r in rings if r[0] == "crown")
    assert jaw[4] > crown[4]


def test_the_shield_hangs_at_one_hip_and_the_spear_crosses_to_the_other(p):
    shield = profiles.figure_shield(p)
    butt, point = profiles.figure_spear(p)
    assert shield["centre"][0] > 0.25
    assert butt[0] < -0.15 and point[0] < -0.05
    assert shield["centre"][0] * butt[0] < 0.0


def test_the_spear_is_held_diagonally_across_the_body(p):
    """Not vertical and not horizontal: the shaft rises past the far shoulder
    from a hand at the hip, which in the profile view is a long diagonal."""
    butt, point = profiles.figure_spear(p)
    rise = point[2] - butt[2]
    run = abs(point[1] - butt[1])
    assert rise > 0.6
    assert 0.25 < run / rise < 1.2


def test_the_shield_is_a_disc_seen_edge_on_from_ahead(p):
    """Its face looks outboard, so athwartships it is thin and in the ship's
    own fore-and-aft plane it is round."""
    shield = profiles.figure_shield(p)
    assert shield["thick"] < shield["radius"] * 0.45


# --- the lower drapery and the trailboards ---------------------------------


def test_the_lower_drapery_sweeps_down_and_aft_into_the_stem(p):
    rings = profiles.figure_drapery(p)
    y_stem = profiles.station_y(p, 0.0)
    for a, b in zip(rings, rings[1:]):
        assert b["centre"][1] < a["centre"][1]
        assert b["centre"][2] < a["centre"][2]
    assert rings[-1]["centre"][1] < y_stem


def test_the_trailboard_upper_edge_is_a_fair_curve_that_flattens_forward(p):
    """A headrail will later be faired into this edge, so it must have no kink
    and no inflection: every segment is less steep than the one abaft it, and
    the forward end runs out nearly level into the figure's own drapery."""
    for sign in (-1.0, 1.0):
        edge = profiles.trailboard_top_edge(p, sign)
        assert len(edge) >= 6
        slopes = [(b[2] - a[2]) / (b[1] - a[1]) for a, b in zip(edge, edge[1:])]
        for s0, s1 in zip(slopes, slopes[1:]):
            assert s1 > s0          # monotone: steep aft, flattening forward
        assert slopes[0] < -0.25    # it really does sweep down off the bow
        assert abs(slopes[-1]) < 0.12


def test_the_trailboard_is_not_two_flat_parallelograms(p):
    """The shape it replaced had four coplanar corners a side and no curvature
    at all; a headrail faired into that would have had to be unpicked."""
    for sign in (-1.0, 1.0):
        edge = profiles.trailboard_top_edge(p, sign)
        chord = [(edge[-1][k] - edge[0][k]) for k in (1, 2)]
        length = math.hypot(*chord)
        sag = max(
            abs((pt[1] - edge[0][1]) * chord[1] - (pt[2] - edge[0][2]) * chord[0])
            / length
            for pt in edge[1:-1]
        )
        assert sag > 0.06


def test_the_trailboard_runs_aft_from_the_figure_onto_the_bow(p):
    y_stem = profiles.station_y(p, 0.0)
    for sign in (-1.0, 1.0):
        edge = profiles.trailboard_top_edge(p, sign)
        assert edge[0][1] < y_stem        # aft end is on the bow itself
        assert edge[-1][1] > y_stem       # forward end is out at the figure
        assert all(x[0] * sign > 0.0 for x in edge)


def test_the_trailboard_forward_end_meets_the_figures_own_drapery(p):
    """It is the figure's fairing, not a shelf floating beside it."""
    rings = profiles.figure_drapery(p)
    for sign in (-1.0, 1.0):
        tip = profiles.trailboard_top_edge(p, sign)[-1]
        near = min(
            math.dist(tip, r["centre"]) - r["radius"] for r in rings
        )
        assert near < 0.30


# --- the triangle budget, which is what sank the first estimate -------------


def test_the_carving_fits_the_triangles_the_dressing_line_has_left(p):
    """`Sail_Patches` grew 28 -> 252 in the interpenetration pass, so the 2,000
    tri dressing line has less room than the earlier estimate assumed."""
    assert 1100 <= profiles.figure_triangles(p) <= 1400
