"""The SPLIT beakhead flight, pinned on a synthetic head form. Pure.

The maintainer's third ruling (E) made the galleon's knee fall with the rail, and
her flight passes over it unsplit (`tests/test_beakhead_deck.py`). The
split path stays in `head` -- `_inboard_edge`, the rump limit in
`_flight_levels` -- because `knee_under_rail=False` is the `HeadForm`
default for any ship that plans a beakhead deck, and the way back if the
falling knee is rejected. No ship is built that way now, so this file
builds the galleon's head form with `knee_under_rail=False` and pins what
it plans: Task 7's flight, figure for figure (final review 3, I-1).

BOTH ENDPOINTS of every figure: PLATFORM TOP is z over the waterline;
`x_in` is CENTRELINE to a split half's INBOARD EDGE; the flight's length is
the FIRST PLATFORM'S AFT EDGE to the LAST PLATFORM'S FORWARD END.
"""

import dataclasses

import pytest

from frigate import carving, head
from frigate.params import GalleonParams

G = GalleonParams()
S = dataclasses.replace(
    G, head_form=dataclasses.replace(G.head_form, knee_under_rail=False))
PLATS = head.beakhead_platforms(S)


def test_the_split_flight_is_task_sevens_figure_for_figure():
    """5 platforms; PLATFORM TOPS 4.6400 / 4.4807 / 4.1457 / 3.8899 /
    3.7553; CENTRELINE to INBOARD EDGE None (the first spans the knee) /
    0.180 / 0.180 / 0.216 / 0.180; the FLIGHT'S FORWARD END y 18.3357,
    `deck_clear` abaft the lion's RUMP; FIRST PLATFORM'S AFT EDGE to
    FORWARD END 1.3057; Beakhead_Deck 432, Beakhead_Grating 18, Headrails
    484 triangles; 7 knee rings (the level-topped knee)."""
    assert len(PLATS) == 5
    assert [pl["top"] for pl in PLATS] == pytest.approx(
        [4.6400, 4.3419, 4.0400, 3.8244, 3.7090], abs=5e-5)   # 42 m hull
    assert PLATS[0]["x_in"] is None
    assert [pl["x_in"] for pl in PLATS[1:]] == pytest.approx(
        [0.180, 0.180, 0.216, 0.180], abs=5e-4)
    assert PLATS[-1]["y_fwd"] == pytest.approx(22.3357, abs=5e-5)
    assert PLATS[-1]["y_fwd"] == pytest.approx(
        head.beakhead_deck_limit_y(S), abs=1e-12)
    assert PLATS[-1]["y_fwd"] - PLATS[0]["y_aft"] == pytest.approx(
        1.3057, abs=5e-5)
    assert head.beakhead_deck_triangles(S) == 432
    assert head.beakhead_grating_triangles(S) == 18
    assert head.headrail_triangles(S) == 484
    assert len(head.knee_rings(S)) == 7


def _carving_surface(p, along=10, around=4):
    """Points on the carving's SURFACE as Figurehead bridges it: every quad
    between two neighbouring rings of a ring group, sampled `along` x
    `around`. Independent of `head._inboard_edge`, which reads the quads'
    corners: a loft bulges between its rings, and the vertices alone said
    the lion's tail stood 0.020 off a half it stands 0.013 off."""
    out = []
    for group in carving.ring_groups(p):
        for a, b in zip(group, group[1:]):
            n = len(a)
            for i in range(n):
                j = (i + 1) % n
                for s in range(along + 1):
                    f = s / along
                    p0 = [a[i][k] + (b[i][k] - a[i][k]) * f
                          for k in range(3)]
                    p1 = [a[j][k] + (b[j][k] - a[j][k]) * f
                          for k in range(3)]
                    for t in range(around + 1):
                        g = t / around
                        out.append(tuple(p0[k] + (p1[k] - p0[k]) * g
                                         for k in range(3)))
    return out


def test_a_split_half_clears_the_knee_and_the_carving_athwartships():
    """Task 7's surface fix, re-run on the split form (Task 10 deleted it
    with the split). A half's INBOARD EDGE to the carving's SURFACE,
    athwartships, wherever that surface stands within `deck_clear` of the
    half's own slab: over its fore-and-aft footprint (+/- the clearance)
    and at a z between its underside and top (+/- the same). Every such
    point lies `deck_clear` inboard of the edge, and the edge stands
    `deck_clear` off the knee's side face (`knee_half`)."""
    c = S.head_form.deck_clear
    surface = _carving_surface(S)
    near = 0
    for pl in PLATS[1:]:
        assert pl["x_in"] - S.head_form.knee_half >= c - 1e-12
        for x, y, z in surface:
            if not pl["y_aft"] - c <= y <= pl["y_fwd"] + c:
                continue
            if not pl["bottom"] - c <= z <= pl["top"] + c:
                continue
            near += 1
            assert pl["x_in"] - abs(x) >= c - 1e-12, (pl, (x, y, z))
    assert near > 0
