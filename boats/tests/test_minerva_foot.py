"""Minerva's bare foot and her drapery stand under HER OWN figure, on any
hull.

`FIG_FOOT` is a world box measured off the frigate, at her stem (y 19.10 to
19.28). Returned as it stands on another hull it left the foot at the
frigate's bow: on the sloop, whose stem is at y 9.00, it floated 10 m ahead
of her, in the air over the bowsprit. The box is now carried with the
figure: offset by how far THIS ship's heel ring stands from the frigate's.
"""

import pytest

from frigate import profiles
from frigate.params import FrigateParams, SloopParams


def test_the_frigates_foot_does_not_move():
    assert profiles.figure_foot_box(FrigateParams()) == profiles.FIG_FOOT


def test_on_the_sloop_the_foot_stands_where_it_stands_on_the_frigate():
    """HEEL RING CENTRE to FOOT, the same on both hulls."""
    f, s = FrigateParams(), SloopParams()
    hf = profiles.figure_axis(f)[0]
    hs = profiles.figure_axis(s)[0]
    for (lo_f, hi_f), (lo_s, hi_s) in [(profiles.figure_foot_box(f),
                                        profiles.figure_foot_box(s))]:
        for k in range(3):
            assert lo_s[k] - hs[k] == pytest.approx(lo_f[k] - hf[k])
            assert hi_s[k] - hs[k] == pytest.approx(hi_f[k] - hf[k])


def test_her_lower_drapery_travels_with_her_too():
    f, s = FrigateParams(), SloopParams()
    hf = profiles.figure_axis(f)[0]
    hs = profiles.figure_axis(s)[0]
    for a, b in zip(profiles.figure_drapery(f), profiles.figure_drapery(s)):
        for k in (1, 2):
            assert b["centre"][k] - hs[k] == pytest.approx(
                a["centre"][k] - hf[k])
    assert profiles.figure_drapery(f)[0]["centre"] == (
        0.0, *profiles.FIG_DRAPERY[0][:2])
