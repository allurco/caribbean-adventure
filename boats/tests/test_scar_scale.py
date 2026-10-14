"""Shot scars sized to the hull they are cut into. No bpy.

The scars were one size for every ship: `damage.SCAR_R` 0.40 m drawn 0.70 to
1.25 of that, which is a frigate's crater. On the sloop, whose deck edge
stands 1.00 m over the water, a 0.50 m crater has no room under her sheer at
all, so she ran no damage pass; on the flute a frigate-sized scar reads as a
hole the size of a port. The maintainer's ruling: smaller hulls take smaller
scars, by a factor the ship states (`DamageForm.scar_scale`), and the band
they are drawn in is the ship's too. The frigate and the galleon keep 1.0 and
the frigate's own band, verbatim, so neither moves (`FRIGATE_SCARS_SHA1`).
"""

import pytest

from frigate import damage, profiles
from frigate.params import (FluteParams, FrigateParams, GalleonParams,
                            SloopParams)

F, G, L, S = FrigateParams(), GalleonParams(), FluteParams(), SloopParams()


def _largest(p):
    return max(s["radius"] for s in damage.shot_scars(p))


def test_the_frigate_and_the_galleon_keep_full_size_scars():
    assert F.damage_form.scar_scale == 1.0
    assert G.damage_form.scar_scale == 1.0
    assert damage.scar_size(F) == (damage.SCAR_R, damage.SCAR_RIM,
                                   damage.SCAR_SHELF, damage.SCAR_DEPTH)


def test_smaller_hulls_state_smaller_scars():
    assert 0.0 < S.damage_form.scar_scale < L.damage_form.scar_scale < 1.0


def test_every_scar_radius_and_depth_scales_with_her_factor():
    for p in (L, S):
        k = p.damage_form.scar_scale
        r, rim, shelf, depth = damage.scar_size(p)
        assert r == pytest.approx(damage.SCAR_R * k)
        assert shelf == pytest.approx(damage.SCAR_SHELF * k)
        assert depth == pytest.approx(damage.SCAR_DEPTH * k)
        # the 2 mm rim is a joint tolerance, not a size: kept
        assert rim == damage.SCAR_RIM
        assert _largest(p) <= damage.SCAR_R * damage.SCAR_JITTER[1] * k


def test_the_largest_scar_shrinks_down_the_fleet():
    assert _largest(S) < _largest(L) < _largest(F)


def test_the_sloop_now_runs_the_damage_pass():
    assert S.builds("damage")


@pytest.mark.parametrize("p", [S, L], ids=["sloop", "flute"])
def test_every_scar_lies_wholly_on_her_hull_between_water_and_sheer(p):
    """SCAR CENTRE less its radius over the WATERLINE, and SCAR CENTRE plus
    its radius under the SHEER at its own station: a crater on the hull
    skin, not in her bulwark and not in the sea."""
    for s in damage.shot_scars(p):
        assert s["z"] - s["radius"] > 0.0
        assert s["z"] + s["radius"] < profiles.sheer(p, s["t"]), s


def test_the_sloops_scars_keep_off_her_ports_and_each_other():
    reach = damage.scar_reach(S)
    for s in damage.shot_scars(S):
        assert damage.scar_port_gap(S, s["t"], s["z"]) > reach
    assert len(damage.shot_scars(S)) == damage.SHOT_SCARS


def test_her_rail_splinters_scale_too():
    """Splinter HEIGHT over the rail cap, at most SPLINTER_LEN times her
    factor."""
    k = S.damage_form.scar_scale
    for base, tip, _half in damage.splinter_spikes(S):
        assert tip[2] - base[2] <= damage.SPLINTER_LEN * k + 1e-9
