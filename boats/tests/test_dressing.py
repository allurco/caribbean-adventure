"""Task 13 — the Jolly Roger and the patched canvas. Pure, no bpy."""

import math

import pytest

from frigate.params import FrigateParams, GalleonParams
from frigate import profiles, sailplan, shiptype as st, wind


@pytest.fixture
def p():
    return FrigateParams()


def test_the_colours_are_hoisted_at_the_mizzen_truck(p):
    staff = wind.flag_staff(p)
    assert staff == pytest.approx(
        profiles.mast_point(p, "mizzen", profiles.mast_truck_z(p, "mizzen"))
    )


def test_the_luff_of_the_flag_is_on_the_staff(p):
    grid = wind.flag_grid(p, 9, 5)
    sx, sy, sz = wind.flag_staff(p)
    for j, row in enumerate(grid):
        assert row[0][0] == pytest.approx(sx)
        assert row[0][1] == pytest.approx(sy)
    assert grid[0][0][2] == pytest.approx(sz)


def test_the_flag_streams_with_the_same_wind_that_fills_the_sails(p):
    """Spec section 7: one vector drives all nine sails AND the flag. Measured as
    the bearing from the staff to the middle of the fly."""
    grid = wind.flag_grid(p, 9, 5)
    sx, sy, sz = wind.flag_staff(p)
    fly = grid[0][-1]
    dx, dy, _dz = wind.wind_direction(p, sz)
    assert math.degrees(math.atan2(fly[0] - sx, fly[1] - sy)) == pytest.approx(
        math.degrees(math.atan2(dx, dy)), abs=6.0
    )


def test_the_flag_hangs_below_its_own_staff_head(p):
    sz = wind.flag_staff(p)[2]
    for row in wind.flag_grid(p, 9, 5):
        for _x, _y, z in row:
            assert z <= sz + 1e-9


def test_the_wave_grows_toward_the_free_fly(p):
    """A flag is held at the luff and free at the fly, so the luff cannot flap."""
    grid = wind.flag_grid(p, 15, 3)
    sx, sy, sz = wind.flag_staff(p)
    dx, dy, _dz = wind.wind_direction(p, sz)
    nx, ny = -dy, dx

    def cross(pt):
        return abs((pt[0] - sx) * nx + (pt[1] - sy) * ny)

    row = grid[0]
    assert cross(row[0]) == pytest.approx(0.0, abs=1e-9)
    assert max(cross(pt) for pt in row[10:]) > max(cross(pt) for pt in row[:4])


def test_the_flag_flies_clear_above_the_mizzen_topgallant_yard(p):
    top_yard_z = profiles.yard_specs(p, "mizzen")[-1][0]
    lowest = min(z for row in wind.flag_grid(p, 9, 5) for _x, _y, z in row)
    assert lowest > top_yard_z


def test_the_patch_set_is_the_same_on_every_rebuild(p):
    assert wind.sail_patches(p) == wind.sail_patches(p)


def test_patches_are_spread_over_several_sails_not_heaped_on_one(p):
    patches = wind.sail_patches(p)
    assert len(patches) == wind.PATCHES
    assert len({(x["mast"], x["tier"]) for x in patches}) >= 4


def test_every_patch_lies_inside_the_sail_it_is_sewn_to(p):
    for patch in wind.sail_patches(p):
        assert -1.0 < patch["u"] - patch["du"] and patch["u"] + patch["du"] < 1.0
        assert 0.0 < patch["v"] - patch["dv"] and patch["v"] + patch["dv"] < 1.0


def test_a_patch_corner_sits_on_the_bellied_canvas_not_the_flat_cut(p):
    """sail_point is what makes this true: a patch placed on the flat panel the
    sail was cut from would float up to 1.5 m off the finished surface."""
    for patch in wind.sail_patches(p)[:4]:
        mast, tier, u, v = patch["mast"], patch["tier"], patch["u"], patch["v"]
        on_cloth = wind.sail_point(p, mast, tier, u, v)
        grid = wind.sail_grid(p, mast, tier, 3, 3)
        flat_y = wind.sail_panel(p, mast, tier)["y"]
        assert on_cloth[1] >= flat_y - 1e-9
        assert grid[1][1] == pytest.approx(wind.sail_point(p, mast, tier, 0.0, 0.5))


def test_the_sail_normal_is_the_shared_wind_at_that_height(p):
    for mast in profiles.mast_names(p):
        for tier in range(3):
            panel = wind.sail_panel(p, mast, tier)
            z = panel["foot_z"] + (panel["head_z"] - panel["foot_z"]) * 0.5
            assert wind.sail_normal(p, mast, tier, 0.5) == wind.wind_direction(p, z)


# --- DEFECT 3: a patch on a sail that is not SQUARE ---------------------------
#
# `wind.sail_patches` draws from `sailplan.all_sails`, which is EVERY sail of
# EVERY kind, and keeps only `(mast, tier)`. `wind.patch_grid` then sampled
# those with `wind.sail_point`, which is the SQUARE path and indexes
# `profiles.yard_specs(p, mast)[tier]`. The galleon's mizzen sets a LATEEN at
# tier 0 and has NO square yard, so `yard_specs(G, "mizzen")` is `[]` and the
# draw raised `IndexError: list index out of range` on 3 of its 14 patches.
#
# It was latent, not new: it reproduces at 89d9b2f. `GalleonParams.passes` did
# not name `sails`, so `dressing.build_dressing` skipped `_patches` entirely
# (`p.builds("sails")` was False) and the galleon's patches were never drawn.
# Naming the pass is what made it reachable.

GAL = GalleonParams()


def _lateen(ship, mast="mizzen"):
    (sail,) = [s for s in ship.rig.mast(mast).sails
               if s.kind is st.SailKind.LATEEN]
    return sail


def test_the_seeded_draw_puts_patches_on_the_galleons_LATEEN_mizzen():
    """Which is the premise of the defect, stated so it cannot drift away."""
    mizzen = [d for d in wind.sail_patches(GAL) if d["mast"] == "mizzen"]
    assert len(mizzen) == 3
    assert all(d["tier"] == 0 for d in mizzen)
    assert profiles.yard_specs(GAL, "mizzen") == [], \
        "and it has no square yard for `wind.sail_panel` to index"


def test_a_patch_on_a_LATEEN_sail_is_sewn_to_the_LATEEN_canvas():
    """Every node ON the lateen cloth, lifted along the lateen's own normal.

    Not on the square-sail surface, and not raising: the surface a patch is
    sewn to is the surface of the sail it is sewn to, whatever kind that is.
    """
    sail = _lateen(GAL)
    c = sailplan.corners(GAL, "mizzen", sail)
    for d in (d for d in wind.sail_patches(GAL) if d["mast"] == "mizzen"):
        grid = wind.patch_grid(GAL, d)
        assert len(grid) == wind.PATCH_NV
        for j, row in enumerate(grid):
            v = d["v"] + (-1.0 + 2.0 * j / (wind.PATCH_NV - 1)) * d["dv"]
            for i, pt in enumerate(row):
                u = d["u"] + (-1.0 + 2.0 * i / (wind.PATCH_NU - 1)) * d["du"]
                cloth = sailplan.surface_point(GAL, c, sail.kind, u, v)
                n = sailplan.belly_direction(GAL, c, cloth[2])
                want = tuple(a + b * wind.PATCH_LIFT for a, b in zip(cloth, n))
                assert pt == pytest.approx(want, abs=1e-12)
                # Proud of its own cloth by exactly the lift, never buried.
                assert math.dist(pt, cloth) == pytest.approx(
                    wind.PATCH_LIFT, abs=1e-12)


def test_every_patch_the_galleon_draws_is_finite_whatever_kind_it_is_on():
    """The whole set, which is what `dressing._patches` loops over."""
    pats = wind.sail_patches(GAL)
    assert len(pats) == wind.PATCHES
    for d in pats:
        for row in wind.patch_grid(GAL, d):
            for pt in row:
                assert all(math.isfinite(co) for co in pt), (d["mast"], d["tier"])


def test_a_SQUARE_patch_still_uses_the_SQUARE_arithmetic_to_the_last_bit():
    """The frigate shipped with these patches and must not move.

    `wind.sail_point` and `wind.sail_normal` are the formulae that produced
    the shipped canvas; the generalisation routes SQUARE back through them
    rather than through the bilinear patch, which is only algebraically
    equal. Checked on the galleon's SQUARE masts too, so the kind dispatch is
    what is under test and not the ship.
    """
    for ship in (FrigateParams(), GAL):
        for d in wind.sail_patches(ship):
            kinds = {s.kind for s in ship.rig.mast(d["mast"]).sails
                     if s.tier == d["tier"]}
            if kinds != {st.SailKind.SQUARE}:
                continue
            for j, row in enumerate(wind.patch_grid(ship, d)):
                v = d["v"] + (-1.0 + 2.0 * j / (wind.PATCH_NV - 1)) * d["dv"]
                for i, pt in enumerate(row):
                    u = d["u"] + (-1.0 + 2.0 * i / (wind.PATCH_NU - 1)) * d["du"]
                    x, y, z = wind.sail_point(ship, d["mast"], d["tier"], u, v)
                    nx, ny, _nz = wind.sail_normal(ship, d["mast"],
                                                   d["tier"], v)
                    assert pt == (x + nx * wind.PATCH_LIFT,
                                  y + ny * wind.PATCH_LIFT, z)


def test_the_patch_dict_keeps_exactly_the_keys_the_frozen_digest_hashes():
    """`tests/test_frigate_frozen.py` hashes `wind.sail_patches(p)` whole.

    The sail's KIND is therefore NOT carried in this dict — a new key would
    move the frigate's digest for a ship that has not moved a millimetre.
    `patch_grid` looks the kind up from the ship's own rig instead.
    """
    for d in wind.sail_patches(FrigateParams()):
        assert sorted(d) == ["du", "dv", "mast", "tier", "u", "v"]
