"""Task 6 — stern castle, transom and gallery math. Pure, no bpy."""

import pytest

from frigate.params import FrigateParams
from frigate import profiles


@pytest.fixture
def p():
    return FrigateParams()


# --- hull_half_width: the hull skin as a function of height ------------------

def test_hull_half_width_reproduces_every_station_ring_point(p):
    """The ring is the authority; this function must agree with it everywhere."""
    for t in profiles.station_ts(p):
        for x, _y, z in profiles.station_ring(p, t):
            assert profiles.hull_half_width(p, t, z) == pytest.approx(abs(x), abs=1e-9)


def test_hull_half_width_at_the_sheer_equals_the_tumbled_max_beam(p):
    for t in (0.2, 0.5, 0.9):
        sz = profiles.sheer(p, t)
        expected = profiles.half_beam(p, t) * profiles.tumblehome(p, sz, sz)
        assert profiles.hull_half_width(p, t, sz) == pytest.approx(expected)


def test_hull_half_width_clamps_below_the_keel_and_above_the_sheer(p):
    t = 0.5
    assert profiles.hull_half_width(p, t, profiles.keel_z(p, t) - 3.0) == pytest.approx(
        profiles.hull_half_width(p, t, profiles.keel_z(p, t))
    )
    sz = profiles.sheer(p, t)
    assert profiles.hull_half_width(p, t, sz + 5.0) == pytest.approx(
        profiles.hull_half_width(p, t, sz)
    )


def test_hull_half_width_rejects_t_outside_the_hull(p):
    with pytest.raises(ValueError):
        profiles.hull_half_width(p, 1.2, 0.0)


# --- stern_half_width: one curve above and below the sheer ------------------

def test_stern_half_width_is_continuous_across_the_sheer(p):
    sz = profiles.sheer(p, 1.0)
    below = profiles.stern_half_width(p, sz - 1e-6)
    above = profiles.stern_half_width(p, sz + 1e-6)
    assert below == pytest.approx(above, abs=1e-4)


def test_stern_half_width_matches_the_bulwark_above_the_sheer(p):
    sz = profiles.sheer(p, 1.0)
    for off in (0.0, 0.5, p.bulwark_h):
        assert profiles.stern_half_width(p, sz + off) == pytest.approx(
            profiles.bulwark_half_width(p, 1.0, sz + off)
        )


def test_stern_half_width_narrows_going_up_the_transom(p):
    sz = profiles.sheer(p, 1.0)
    assert profiles.stern_half_width(p, sz + p.bulwark_h) < profiles.stern_half_width(p, sz)


# --- stern chase ports ------------------------------------------------------

def test_two_stern_chase_ports_complete_the_twenty_four_gun_battery(p):
    assert (profiles.total_broadside_ports(p) + len(profiles.chase_u_edges(p))
            == 24)


def test_chase_ports_are_symmetric_about_the_centreline(p):
    (a0, a1), (b0, b1) = profiles.chase_u_edges(p)
    assert a0 == pytest.approx(-b1)
    assert a1 == pytest.approx(-b0)


def test_chase_ports_clear_the_transom_edges_and_the_sternpost(p):
    (a0, a1), (b0, b1) = profiles.chase_u_edges(p)
    assert -1.0 < a0 < a1 < 0.0 < b0 < b1 < 1.0


def test_chase_port_width_at_mid_height_equals_the_broadside_port_width(p):
    """The u-space edges must cash out to port_w metres on the transom plane."""
    sz = profiles.sheer(p, 1.0)
    z_mid = sz + p.gun_decks[0].sill + p.gun_decks[0].height / 2.0
    hw = profiles.stern_half_width(p, z_mid)
    (_a0, _a1), (b0, b1) = profiles.chase_u_edges(p)
    assert (b1 - b0) * hw == pytest.approx(p.gun_decks[0].width)


# --- the transom column grid ------------------------------------------------

def test_transom_us_span_the_whole_panel_and_are_strictly_increasing(p):
    us = profiles.transom_us(p)
    assert us[0] == pytest.approx(-1.0)
    assert us[-1] == pytest.approx(1.0)
    assert all(b - a > 1e-3 for a, b in zip(us, us[1:]))


def test_transom_us_carry_a_seam_at_every_chase_port_edge(p):
    us = profiles.transom_us(p)
    for edges in profiles.chase_u_edges(p):
        for u in edges:
            assert any(abs(u - existing) < 1e-9 for existing in us)


def test_transom_bands_pick_one_band_per_chase_port(p):
    bands = profiles.transom_bands(p)
    assert len(bands) == 2
    assert all(len(b) == 1 for b in bands)
    us = profiles.transom_us(p)
    for band, (u0, u1) in zip(bands, profiles.chase_u_edges(p)):
        i = band[0]
        assert us[i] == pytest.approx(u0)
        assert us[i + 1] == pytest.approx(u1)


def test_transom_rows_reuse_the_bulwark_rows_so_the_rail_lines_up(p):
    assert profiles.transom_row_offsets(p) == profiles.bulwark_row_offsets(p)


# --- the stern gallery ------------------------------------------------------

def test_gallery_band_sits_under_the_sheer_and_above_the_waterline(p):
    z_lo, z_hi = profiles.gallery_band(p)
    assert 0.0 < z_lo < z_hi < profiles.sheer(p, 1.0)


def test_gallery_windows_are_five_and_lie_inside_the_band(p):
    z_lo, z_hi = profiles.gallery_band(p)
    rects = profiles.gallery_window_rects(p)
    assert len(rects) == 5
    for _x0, _x1, w_lo, w_hi in rects:
        assert z_lo < w_lo < w_hi < z_hi


def test_gallery_windows_do_not_overlap_and_run_port_to_starboard(p):
    rects = profiles.gallery_window_rects(p)
    for (_a0, a1, _, _), (b0, _b1, _, _) in zip(rects, rects[1:]):
        assert a1 < b0


def test_gallery_windows_are_symmetric_about_the_centreline(p):
    rects = profiles.gallery_window_rects(p)
    for front, back in zip(rects, reversed(rects)):
        assert front[0] == pytest.approx(-back[1])
        assert front[1] == pytest.approx(-back[0])


def test_gallery_wall_stays_inboard_of_the_hull_at_every_window_height(p):
    """A window that pokes through the transom skin would show daylight."""
    for x0, x1, z_lo, z_hi in profiles.gallery_window_rects(p):
        for z in (z_lo, z_hi):
            assert max(abs(x0), abs(x1)) < profiles.hull_half_width(p, 1.0, z)


def test_gallery_half_width_leaves_a_frame_margin_inside_the_hull(p):
    for z in profiles.gallery_band(p):
        assert profiles.gallery_half_width(p, z) < profiles.hull_half_width(p, 1.0, z)
