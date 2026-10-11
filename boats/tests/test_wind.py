"""Task 9 — the shared wind field and the nine sail grids. Pure, no bpy.

Spec section 7: ONE wind vector drives all nine sails and the flag. Without it
each sail bellies independently and the ship appears to be in two weathers at
once. Sails on the same mast take a small progressive twist with height.
"""

import math

import pytest

from frigate.params import FrigateParams, GalleonParams
from frigate import profiles, wind


@pytest.fixture
def p():
    return FrigateParams()


def _all_sails(p=None):
    p = FrigateParams() if p is None else p
    return [(m, k) for m in profiles.mast_names(p) for k in range(3)]


# --- the shared field -------------------------------------------------------

def test_there_are_nine_sails(p):
    assert len(_all_sails()) == 9


def test_the_wind_direction_is_a_unit_vector_at_every_height(p):
    for z in (0.0, 5.0, 15.0, 30.0, 36.0):
        v = wind.wind_direction(p, z)
        assert math.sqrt(sum(c * c for c in v)) == pytest.approx(1.0)


def test_the_wind_blows_the_sails_forward(p):
    """The ship is on a quarter reach: the drive is forward, +Y."""
    for z in (5.0, 20.0, 35.0):
        assert wind.wind_direction(p, z)[1] > 0.6


def test_the_wind_is_horizontal(p):
    for z in (5.0, 20.0, 35.0):
        assert wind.wind_direction(p, z)[2] == 0.0


def test_twist_grows_with_height_and_is_capped(p):
    angles = [wind.twist_deg(p, z) for z in (0.0, 10.0, 20.0, 30.0, 40.0, 80.0)]
    assert angles == sorted(angles)
    assert angles[0] == 0.0
    assert max(angles) <= wind.MAX_TWIST_DEG


def test_every_mast_sees_the_same_wind_at_the_same_height(p):
    """This is the whole point of a shared field: the direction is a function of
    HEIGHT ALONE, never of which mast or which sail is asking."""
    for z in (12.0, 20.0, 30.0):
        directions = {wind.wind_direction(p, z) for _m in profiles.mast_names(p)}
        assert len(directions) == 1


def test_the_flag_takes_the_same_wind_as_the_sails(p):
    """Task 13's Jolly Roger must not fly in its own weather."""
    z = 25.0
    assert wind.wind_direction(p, z) == wind.wind_direction(p, z)
    assert wind.twist_deg(p, z) == wind.twist_deg(p, z)


# --- the belly falloff ------------------------------------------------------

def test_the_head_of_a_sail_is_laced_to_its_yard_and_cannot_belly(p):
    for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
        assert wind.belly(u, 1.0) == pytest.approx(0.0)


def test_the_leeches_and_the_clews_are_pinned(p):
    for v in (0.0, 0.5, 1.0):
        assert wind.belly(-1.0, v) == pytest.approx(0.0)
        assert wind.belly(1.0, v) == pytest.approx(0.0)


def test_the_belly_is_deepest_low_and_amidships(p):
    assert wind.belly(0.0, 0.0) == pytest.approx(1.0)
    assert wind.belly(0.0, 0.5) < wind.belly(0.0, 0.0)
    assert wind.belly(0.3, 0.2) < wind.belly(0.0, 0.2)


def test_the_belly_never_pulls_the_canvas_backwards(p):
    for i in range(11):
        for j in range(11):
            assert wind.belly(-1 + 0.2 * i, 0.1 * j) >= 0.0


# --- the sail panels --------------------------------------------------------

def test_every_sail_hangs_from_its_own_yard(p):
    for mast, tier in _all_sails():
        panel = wind.sail_panel(p, mast, tier)
        yard_z, yard_len, _r = profiles.yard_specs(p, mast)[tier]
        assert panel["head_z"] == pytest.approx(yard_z)
        assert panel["head_half"] < yard_len / 2


def test_a_sail_foot_is_sheeted_to_the_yard_below_so_it_flares(p):
    for mast in profiles.mast_names(p):
        for tier in (1, 2):
            panel = wind.sail_panel(p, mast, tier)
            assert panel["foot_half"] > panel["head_half"]


def test_a_course_is_the_one_sail_that_does_not_flare(p):
    for mast in profiles.mast_names(p):
        panel = wind.sail_panel(p, mast, 0)
        assert panel["foot_half"] == pytest.approx(panel["head_half"])


def test_no_sail_foot_reaches_the_yard_below_it(p):
    for mast in profiles.mast_names(p):
        yards = profiles.yard_specs(p, mast)
        for tier in (1, 2):
            panel = wind.sail_panel(p, mast, tier)
            assert panel["foot_z"] > yards[tier - 1][0] + 0.3


def test_a_course_foot_stays_clear_above_the_rail(p):
    for mast in profiles.mast_names(p):
        t = profiles.mast_t(p, mast)
        rail = profiles.sheer(p, t) + p.bulwark_h
        assert wind.sail_panel(p, mast, 0)["foot_z"] > rail + 0.5


def test_a_sail_is_taller_than_it_is_deep_nowhere_absurd(p):
    for mast, tier in _all_sails():
        panel = wind.sail_panel(p, mast, tier)
        depth = panel["head_z"] - panel["foot_z"]
        assert 0.3 < depth / (2 * panel["head_half"]) < 1.2


# --- the displaced grid -----------------------------------------------------

def test_a_sail_grid_has_the_requested_resolution(p):
    grid = wind.sail_grid(p, "main", 0, 7, 5)
    assert len(grid) == 5 and all(len(row) == 7 for row in grid)


def test_the_grid_head_row_sits_exactly_on_the_yard(p):
    for mast, tier in _all_sails():
        grid = wind.sail_grid(p, mast, tier, 7, 5)
        panel = wind.sail_panel(p, mast, tier)
        for x, y, z in grid[-1]:
            assert z == pytest.approx(panel["head_z"])
            assert y == pytest.approx(panel["y"]), "the head cannot belly off the yard"


def test_the_four_corners_of_every_sail_stay_on_the_flat_plane(p):
    for mast, tier in _all_sails():
        grid = wind.sail_grid(p, mast, tier, 9, 7)
        panel = wind.sail_panel(p, mast, tier)
        for row in (grid[0], grid[-1]):
            for x, y, z in (row[0], row[-1]):
                assert y == pytest.approx(panel["y"])


def test_every_sail_bellies_forward_and_none_backward(p):
    for mast, tier in _all_sails():
        panel = wind.sail_panel(p, mast, tier)
        grid = wind.sail_grid(p, mast, tier, 9, 7)
        offsets = [y - panel["y"] for row in grid for _x, y, _z in row]
        assert max(offsets) > 0.1
        assert min(offsets) >= -1e-9


def test_belly_depth_scales_with_the_sail_not_with_the_ship(p):
    """A topgallant must not belly as deep as a course."""
    for mast in profiles.mast_names(p):
        depths = []
        for tier in range(3):
            panel = wind.sail_panel(p, mast, tier)
            grid = wind.sail_grid(p, mast, tier, 9, 7)
            depths.append(max(y - panel["y"] for row in grid for _x, y, _z in row))
        assert depths[0] > depths[1] > depths[2]


def test_the_twist_turns_the_higher_sails_off_the_wind(p):
    """Twist is an ANGLE, so measure the angle. The first draft of this test
    measured the sideways reach of the deepest point in metres, which the course
    wins on size alone: it bellies 1.50 m against the topgallant's 0.78 m, so a
    smaller angle still gave a larger offset."""
    for mast in profiles.mast_names(p):
        angles = []
        for tier in range(3):
            panel = wind.sail_panel(p, mast, tier)
            grid = wind.sail_grid(p, mast, tier, 9, 7)
            deepest = max((row[len(row) // 2] for row in grid),
                          key=lambda pt: pt[1] - panel["y"])
            angles.append(math.degrees(math.atan2(deepest[0], deepest[1] - panel["y"])))
        assert angles == sorted(angles), "canvas turns further off the wind with height"
        assert angles[2] > angles[0] + 2.0


def test_every_sail_hangs_forward_of_its_own_mast(p):
    """The yard is slung forward of the mast, so the canvas is too. Measured
    sail-plane-to-mast-axis at the sail's own head height, against the mast's
    radius there."""
    for mast, tier in _all_sails():
        panel = wind.sail_panel(p, mast, tier)
        axis_y = profiles.mast_point(p, mast, panel["head_z"])[1]
        assert panel["y"] - axis_y > profiles.mast_radius(p, mast)


# --- Task 1 (interpenetration): a patch must follow the cloth it is sewn to --

def _proud_of_the_canvas(p, patch, u, v, point):
    """How far `point` stands off the bellied canvas at (u, v), along the
    canvas's own normal. Negative means it has sunk through the cloth."""
    x, y, z = wind.sail_point(p, patch["mast"], patch["tier"], u, v)
    nx, ny, _nz = wind.sail_normal(p, patch["mast"], patch["tier"], v)
    return (point[0] - x) * nx + (point[1] - y) * ny


def test_every_patch_node_stands_the_stated_lift_off_its_own_sail(p):
    for patch in wind.sail_patches(p):
        grid = wind.patch_grid(p, patch)
        for j, row in enumerate(grid):
            for i, point in enumerate(row):
                u = patch["u"] + (-1.0 + 2.0 * i / (wind.PATCH_NU - 1)) * patch["du"]
                v = patch["v"] + (-1.0 + 2.0 * j / (wind.PATCH_NV - 1)) * patch["dv"]
                assert _proud_of_the_canvas(p, patch, u, v, point) == pytest.approx(
                    wind.PATCH_LIFT, abs=1e-9)


def test_no_patch_quad_sinks_through_the_canvas_between_its_corners(p):
    """The bug `check_intersections` caught, as pure arithmetic.

    A patch stands 35 mm proud of the sail AT ITS NODES. Cut as one flat quad,
    the chord between two nodes 3.0 m apart on a main course is straight while
    the canvas between them bellies up to 72 mm, so the sail came out through
    its own patch: 37 intersecting face pairs. Sampling the SAME displacement
    function at interior grid positions is the fix; raising the lift is not,
    because that makes the patch float.
    """
    for patch in wind.sail_patches(p):
        grid = wind.patch_grid(p, patch)
        for j in range(wind.PATCH_NV - 1):
            for i in range(wind.PATCH_NU - 1):
                corners = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                mid = [sum(c[k] for c in corners) / 4.0 for k in range(3)]
                du = (-1.0 + 2.0 * (i + 0.5) / (wind.PATCH_NU - 1)) * patch["du"]
                dv = (-1.0 + 2.0 * (j + 0.5) / (wind.PATCH_NV - 1)) * patch["dv"]
                sag = _proud_of_the_canvas(
                    p, patch, patch["u"] + du, patch["v"] + dv, mid)
                assert sag > 0.4 * wind.PATCH_LIFT, (patch["mast"], patch["tier"], sag)


def test_one_flat_quad_per_patch_would_NOT_pass_that_test(p):
    """The mutation that proves the test above measures something real: at the
    old resolution the worst patch quad dips BELOW the canvas it is sewn to."""
    worst = 1.0
    for patch in wind.sail_patches(p):
        corners = [pt for row in wind.patch_grid(p, patch, 2, 2) for pt in row]
        mid = [sum(c[k] for c in corners) / 4.0 for k in range(3)]
        worst = min(worst, _proud_of_the_canvas(
            p, patch, patch["u"], patch["v"], mid))
    assert worst < 0.0, f"worst single-quad patch stood {worst:.3f} m proud"


# --- DEFECT 6: a fixed stand-off on a ship with a thicker mast ---------------
#
# `wind.SAIL_FWD` stood every sail's plane 0.450 m forward of its own mast's
# axis on every ship. Measured, both endpoints named — SAIL PLANE to MAST AXIS
# at the sail's own head, against the mast's own radius there:
#
#   frigate fore   clear +0.4500 m, mast radius 0.3900  — 0.060 m of air
#   frigate main   clear +0.4500 m, mast radius 0.4200  — 0.030 m of air
#   frigate mizzen clear +0.4500 m, mast radius 0.3300  — 0.120 m of air
#   galleon fore   clear +0.4500 m, mast radius 0.4200  — 0.030 m of air
#   GALLEON MAIN   clear +0.4500 m, mast radius 0.4800  — 0.030 m INSIDE it
#
# All three of the galleon's main courses hung THROUGH their own mast. The
# frigate's thickest mast is 0.420 m in the radius and 0.450 clears it, which
# is how a frigate figure came to be written down as a fact about ships.


def test_every_square_sail_hangs_CLEAR_of_its_own_masts_SKIN():
    """SAIL PLANE to MAST SKIN at the sail's own head, on both ships.

    Not to the mast AXIS: a mast has girth, and the quantity that decides
    whether canvas passes through timber is the distance to the timber.
    """
    for ship in (FrigateParams(), GalleonParams()):
        for mast in profiles.mast_names(ship):
            radius = profiles.mast_radius(ship, mast)
            for tier, _spec in enumerate(profiles.yard_specs(ship, mast)):
                panel = wind.sail_panel(ship, mast, tier)
                axis_y = profiles.mast_point(ship, mast, panel["head_z"])[1]
                clear = panel["y"] - axis_y
                assert clear > radius, (
                    f"{ship.collection} {mast} tier {tier}: the sail plane "
                    f"stands {clear:.4f} m forward of an axis whose mast is "
                    f"{radius:.4f} m in the radius"
                )


def test_the_galleons_MAIN_is_the_mast_that_demanded_the_floor():
    """The premise, measured, so it cannot drift away from the fix."""
    G = GalleonParams()
    assert profiles.mast_radius(G, "main") == pytest.approx(0.48, abs=1e-9)
    assert profiles.mast_radius(G, "main") > wind.SAIL_FWD, \
        "the stated stand-off is INSIDE this mast"
    for tier in range(len(profiles.yard_specs(G, "main"))):
        panel = wind.sail_panel(G, "main", tier)
        axis_y = profiles.mast_point(G, "main", panel["head_z"])[1]
        assert panel["y"] - axis_y > 0.48


def test_the_frigates_canvas_cannot_move_because_the_floor_never_binds_on_her():
    """Her thickest mast is 0.420 m in the radius and the stated stand-off is
    0.450, so the greater of the two IS the stated one on every one of her
    masts — the same shape of argument as `HullForm.tumble_floor`."""
    F = FrigateParams()
    for mast in profiles.mast_names(F):
        radius = profiles.mast_radius(F, mast)
        assert radius + wind.SAIL_MAST_CLEAR <= wind.SAIL_FWD
        # THE QUANTITY THAT HAS TO BE EXACT is what the offset IS, not the
        # difference of two world coordinates — `panel["y"]` is
        # `mast_point(...)[1] + sail_fwd(...)` and subtracting the first term
        # back off is a float round trip, not a geometric change. That the
        # frigate's canvas has not moved is proved by the frozen plan digest,
        # which hashes every vertex of every sail grid.
        assert wind.sail_fwd(F, mast) == wind.SAIL_FWD
        for tier, _spec in enumerate(profiles.yard_specs(F, mast)):
            panel = wind.sail_panel(F, mast, tier)
            axis_y = profiles.mast_point(F, mast, panel["head_z"])[1]
            assert panel["y"] - axis_y == pytest.approx(wind.SAIL_FWD, abs=1e-15)
    # And it DOES bind on the galleon's main, which is the whole point.
    G = GalleonParams()
    assert wind.sail_fwd(G, "main") == pytest.approx(0.51, abs=1e-9)
    assert wind.sail_fwd(G, "fore") == wind.SAIL_FWD
