import math
import pytest
from frigate.params import FrigateParams
from frigate import profiles

P = FrigateParams()


def test_station_y_spans_the_hull():
    assert profiles.station_y(P, 0.0) == pytest.approx(19.0)   # stem, +Y is forward
    assert profiles.station_y(P, 1.0) == pytest.approx(-19.0)  # transom


def test_max_beam_occurs_at_the_specified_station():
    ts = [i / 400 for i in range(401)]
    widest = max(ts, key=lambda t: profiles.half_beam(P, t))
    assert widest == pytest.approx(P.max_beam_t, abs=0.01)
    assert profiles.half_beam(P, P.max_beam_t) == pytest.approx(P.half_beam)


def test_entry_is_finer_than_the_run():
    """Equal distance either side of max beam: the bow must be narrower."""
    fwd = profiles.half_beam(P, P.max_beam_t - 0.25)
    aft = profiles.half_beam(P, P.max_beam_t + 0.25)
    assert fwd < aft


def test_sheer_dips_amidships_and_rises_at_both_ends():
    assert profiles.sheer(P, 0.5) == pytest.approx(P.deck_z)
    assert profiles.sheer(P, 0.0) == pytest.approx(P.deck_z + P.bow_rise)
    assert profiles.sheer(P, 1.0) == pytest.approx(P.deck_z + P.stern_rise)
    assert profiles.sheer(P, 0.25) > profiles.sheer(P, 0.5)


def test_keel_is_deepest_amidships_and_rises_at_the_ends():
    assert profiles.keel_z(P, 0.45) == pytest.approx(-P.draft)
    assert profiles.keel_z(P, 0.0) > -P.draft    # forefoot rise
    assert profiles.keel_z(P, 1.0) > -P.draft    # transom tuck
    assert profiles.keel_z(P, 0.0) < 0.0         # stem still cuts the water


def test_tumblehome_narrows_the_topsides():
    assert profiles.tumblehome(P, 0.0, 4.2) == pytest.approx(1.0)
    assert profiles.tumblehome(P, 4.2, 4.2) < 0.95
    assert profiles.tumblehome(P, 4.2, 4.2) > 0.80


def test_ring_has_the_specified_point_count():
    assert len(profiles.station_ring(P, 0.5)) == 2 * P.pts_per_half


def test_ring_is_symmetric_about_the_centreline():
    ring = profiles.station_ring(P, 0.5)
    xs = sorted(round(pt[0], 6) for pt in ring)
    mirrored = sorted(round(-pt[0], 6) for pt in ring)
    assert xs == mirrored


def test_midship_ring_reaches_full_beam_at_the_waterline():
    ring = profiles.station_ring(P, P.max_beam_t)
    assert max(pt[0] for pt in ring) == pytest.approx(P.half_beam, rel=0.02)


def test_ring_is_narrower_at_the_deck_than_at_the_waterline():
    ring = [pt for pt in profiles.station_ring(P, 0.5) if pt[0] > 0]
    at_deck = max(ring, key=lambda pt: pt[2])
    near_wl = min(ring, key=lambda pt: abs(pt[2]))
    assert at_deck[0] < near_wl[0]


def test_every_ring_stays_inside_the_declared_envelope():
    for ring in profiles.all_stations(P):
        for x, y, z in ring:
            assert all(math.isfinite(v) for v in (x, y, z))
            assert abs(x) <= P.half_beam + 1e-6
            assert -P.draft - 1e-6 <= z <= P.deck_z + P.bow_rise + 1e-6
            assert -P.half_loa - 1e-6 <= y <= P.half_loa + 1e-6


def test_all_stations_returns_one_ring_per_station():
    """One more ring than `n_stations`: the uniform grid plus the max-beam corner."""
    assert len(profiles.all_stations(P)) == len(profiles.station_ts(P))
    assert len(profiles.station_ts(P)) == P.n_stations + 1


@pytest.mark.parametrize("bad_t", [-0.01, 1.01, 2.0, -5.0])
def test_out_of_range_station_is_rejected(bad_t):
    """An unclamped t extrapolates to a negative half-beam and inverts the hull."""
    with pytest.raises(ValueError, match="t must be in"):
        profiles.half_beam(P, bad_t)
    with pytest.raises(ValueError, match="t must be in"):
        profiles.station_ring(P, bad_t)


def test_bulwark_base_meets_the_hull_top_ring_exactly():
    """A mismatch here leaves a visible seam where the bulwark floats off the hull."""
    for t in (0.0, 0.2, 0.42, 0.5, 0.8, 1.0):
        sz = profiles.sheer(P, t)
        ring = profiles.station_ring(P, t)
        hull_top = max(pt[0] for pt in ring if abs(pt[2] - sz) < 1e-9)
        assert profiles.bulwark_half_width(P, t, sz) == pytest.approx(hull_top)


def test_bulwark_keeps_leaning_inward_above_the_deck():
    """Plain tumblehome clamps at the sheer, so the topsides would go vertical."""
    t = 0.5
    sz = profiles.sheer(P, t)
    at_deck = profiles.bulwark_half_width(P, t, sz)
    at_rail = profiles.bulwark_half_width(P, t, sz + P.bulwark_h)
    assert at_rail < at_deck
    assert at_rail > at_deck * 0.85


def test_bulwark_never_exceeds_the_declared_beam():
    offsets = profiles.bulwark_row_offsets(P)
    for i in range(101):
        t = i / 100
        sz = profiles.sheer(P, t)
        for off in offsets:
            assert profiles.bulwark_half_width(P, t, sz + off) <= P.half_beam + 1e-9


def test_bulwark_top_at_the_stem_stays_within_a_plausible_freeboard():
    """Sheer and bulwark compound at the bow; unchecked, the stem becomes a wall."""
    assert profiles.sheer(P, 0.0) + P.bulwark_h < 9.5


def test_t_of_y_inverts_station_y():
    for i in range(21):
        t = i / 20
        assert profiles.t_of_y(P, profiles.station_y(P, t)) == pytest.approx(t)


def test_t_of_y_clamps_outside_the_hull():
    assert profiles.t_of_y(P, 999.0) == 0.0
    assert profiles.t_of_y(P, -999.0) == 1.0


def test_gunport_count_and_ordering():
    ts = profiles.gunport_ts(P, 0)
    assert P.gun_decks[0].n_ports == 11
    assert len(ts) == 11
    assert ts == sorted(ts)
    assert ts[0] == pytest.approx(P.gun_decks[0].t0)
    assert ts[-1] == pytest.approx(P.gun_decks[0].t1)


def test_gunports_do_not_overlap():
    """Overlapping apertures merge into one continuous slot down the side."""
    ys = [profiles.station_y(P, t) for t in profiles.gunport_ts(P, 0)]
    spacings = [a - b for a, b in zip(ys, ys[1:])]  # y decreases going aft
    assert min(spacings) > P.gun_decks[0].width


def test_gunport_fits_between_the_deck_and_the_rail():
    for t in profiles.gunport_ts(P, 0):
        sz = profiles.sheer(P, t)
        cz = profiles.port_center_z(P, t, 0)
        assert cz - P.gun_decks[0].height / 2 > sz, "port sill is below the deck edge"
        assert cz + P.gun_decks[0].height / 2 < sz + P.bulwark_h, "port head breaks the rail"


def test_bulwark_row_offsets_bracket_the_port_exactly():
    """Rows are seams, not a chosen count: the aperture must be exactly one row."""
    offs = profiles.bulwark_row_offsets(P)
    assert len(offs) == 4
    assert offs == sorted(offs)
    assert len(set(offs)) == 4
    assert offs[0] == 0.0
    assert offs[1] == pytest.approx(P.gun_decks[0].sill)
    assert offs[2] == pytest.approx(P.gun_decks[0].sill + P.gun_decks[0].height)
    assert offs[3] == pytest.approx(P.bulwark_h)


def test_bulwark_ts_is_sorted_with_no_near_duplicates():
    ts = profiles.bulwark_ts(P)
    assert ts == sorted(ts)
    assert len(ts) == len(set(ts))
    assert ts[0] == pytest.approx(0.0)
    assert ts[-1] == pytest.approx(1.0)
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    assert min(gaps) > 1e-4, "near-duplicate stations make zero-area faces"


def test_bulwark_ts_contains_every_station_and_every_port_edge():
    ts = profiles.bulwark_ts(P)
    for station in profiles.station_ts(P):
        assert any(abs(t - station) < 1e-9 for t in ts)
    for fwd, aft in profiles.port_edge_ts(P, 0):
        assert any(abs(t - fwd) < 1e-4 for t in ts)
        assert any(abs(t - aft) < 1e-4 for t in ts)


def test_every_port_is_bounded_by_grid_seams():
    """Task 5 selects an aperture by face centre, so no band may cross a port edge.

    A port spanning two bands is fine — six of the eleven do, because they straddle
    a hull station. What must hold is that both edges are themselves seams, so the
    aperture covers a whole number of faces and its boundary is exact.
    """
    ts = profiles.bulwark_ts(P)
    for fwd, aft in profiles.port_edge_ts(P, 0):
        i = min(range(len(ts)), key=lambda k: abs(ts[k] - fwd))
        j = min(range(len(ts)), key=lambda k: abs(ts[k] - aft))
        assert abs(ts[i] - fwd) < 1e-4, f"port edge {fwd:.4f} is not a grid seam"
        assert abs(ts[j] - aft) < 1e-4, f"port edge {aft:.4f} is not a grid seam"
        assert j > i, f"port {fwd:.4f}..{aft:.4f} spans no band at all"
        assert j - i <= 3, f"port {fwd:.4f}..{aft:.4f} spans {j - i} bands; port_w is too wide"


def test_no_grid_seam_falls_inside_a_port_without_bounding_it():
    """The seams inside an aperture are the ones that split it into bands."""
    ts = profiles.bulwark_ts(P)
    for fwd, aft in profiles.port_edge_ts(P, 0):
        interior = [t for t in ts if fwd + 1e-9 < t < aft - 1e-9]
        stations = profiles.station_ts(P)
        for t in interior:
            assert any(abs(t - s) < 1e-9 for s in stations), (
                f"seam {t:.6f} inside port {fwd:.4f}..{aft:.4f} is neither a port "
                "edge nor a hull station"
            )


def test_deck_surface_is_narrower_than_the_waterline_beam():
    for t in (0.3, 0.5, 0.7):
        assert profiles.deck_half_beam(P, t) < profiles.half_beam(P, t)


def test_deck_half_beam_sits_inside_the_bulwark_inner_face():
    t = 0.5
    sz = profiles.sheer(P, t)
    expected = profiles.bulwark_half_width(P, t, sz) - P.bulwark_thick
    assert profiles.deck_half_beam(P, t) == pytest.approx(expected)


def test_camber_crowns_the_centreline_and_vanishes_at_the_deck_edge():
    t = 0.5
    edge = profiles.deck_half_beam(P, t)
    assert profiles.camber_z(P, t, 0.0) == pytest.approx(P.deck_camber)
    assert profiles.camber_z(P, t, edge) == pytest.approx(0.0, abs=1e-9)
    assert 0.0 < profiles.camber_z(P, t, edge * 0.5) < P.deck_camber


def test_camber_is_symmetric_about_the_centreline():
    assert profiles.camber_z(P, 0.5, 1.4) == pytest.approx(profiles.camber_z(P, 0.5, -1.4))


def test_deck_surface_drains_outboard():
    """Camber exists so water runs off; the centreline must be the high point."""
    t = 0.5
    edge = profiles.deck_half_beam(P, t)
    assert profiles.deck_z_at(P, t, 0.0) > profiles.deck_z_at(P, t, edge * 0.6)
    assert profiles.deck_z_at(P, t, edge * 0.6) > profiles.deck_z_at(P, t, edge)
    assert profiles.deck_z_at(P, t, edge) == pytest.approx(profiles.sheer(P, t))


def test_raised_tiers_sit_below_the_bulwark_top():
    """A tier taller than the bulwark leaves the deck floating with nothing round it."""
    for t, rise in ((0.0, P.fcastle_rise), (1.0, P.quarter_rise)):
        assert profiles.deck_z_at(P, t, 0.0, rise) < profiles.sheer(P, t) + P.bulwark_h


def test_gun_deck_runs_under_both_raised_tiers():
    """Every gunport must have main deck beneath it for Task 11 to seat a cannon."""
    for t in profiles.gunport_ts(P, 0):
        assert 0.04 <= t <= 0.96
        assert profiles.port_center_z(P, t, 0) < profiles.deck_z_at(P, t, 0.0, P.quarter_rise)


def _chord_half_width(station_ts, t):
    """Hull half-width at sheer height where the lofted skin actually lies.

    The loft bridges station rings with flat quads, so between two stations the
    skin is a straight chord, not the `half_beam` curve. A bulwark seam samples
    the curve, so wherever the curve bulges away from its chord the bulwark
    overhangs the hull.
    """
    for a, b in zip(station_ts, station_ts[1:]):
        if a - 1e-12 <= t <= b + 1e-12:
            f = 0.0 if b == a else (t - a) / (b - a)
            ends = [
                profiles.half_beam(P, s) * profiles.tumblehome(P, profiles.sheer(P, s),
                                                               profiles.sheer(P, s))
                for s in (a, b)
            ]
            return ends[0] + (ends[1] - ends[0]) * f
    raise AssertionError(f"seam {t} lies outside the station range")


def test_no_bulwark_seam_overhangs_the_lofted_hull():
    """The shoulder regression: `half_beam` has a corner at `max_beam_t`.

    Its entry branch arrives climbing and its run branch leaves flat, so uniform
    station spacing chorded straight across maximum beam and the seam at t=0.418
    stood 121 mm outside the hull skin (143 mm once subsurf was applied). Sampling
    `max_beam_t` as a station is what keeps every seam inside this tolerance.
    """
    stations = profiles.station_ts(P)
    worst_t, worst_d = None, 0.0
    for t in profiles.bulwark_ts(P):
        sz = profiles.sheer(P, t)
        d = profiles.bulwark_half_width(P, t, sz) - _chord_half_width(stations, t)
        if d > worst_d:
            worst_t, worst_d = t, d
    assert worst_d < 0.01, f"seam t={worst_t} overhangs the hull by {worst_d * 1000:.1f} mm"


def test_max_beam_is_sampled_as_a_station():
    assert any(abs(t - P.max_beam_t) < 1e-9 for t in profiles.station_ts(P))


def test_every_gunport_selects_at_least_one_band():
    """A port that selects nothing means the grid is wrong, not the selection box."""
    bands = profiles.gunport_bands(P, 0)
    assert len(bands) == P.gun_decks[0].n_ports
    for k, idx in enumerate(bands):
        assert idx, f"gunport {k} selected no band"


def test_an_aperture_tiles_its_port_exactly():
    """Bands are contiguous and sum to the port width — never wider, never short.

    `bulwark_ts` seams the grid at both port edges, so the aperture can land on
    face boundaries. If this drifts, the cut is coming out the wrong size and the
    fix belongs in the grid, not in a widened selection.
    """
    ts = profiles.bulwark_ts(P)
    for (fwd, aft), idx in zip(profiles.port_edge_ts(P, 0), profiles.gunport_bands(P, 0)):
        assert idx == list(range(idx[0], idx[-1] + 1)), "bands are not contiguous"
        assert ts[idx[0]] == pytest.approx(fwd)
        assert ts[idx[-1] + 1] == pytest.approx(aft)


def test_an_aperture_spans_one_band_or_two():
    """Ports sit 0.062 apart in t and stations fall every 0.0435, so six of the
    eleven ports straddle a station and span two bands. That is correct: what
    matters is that no band crosses a port edge, never that a port is one face."""
    widths = [len(idx) for idx in profiles.gunport_bands(P, 0)]
    assert set(widths) <= {1, 2}
    assert widths.count(2) >= 1, "the two-band case must stay exercised"


def test_no_band_is_cut_twice():
    seen = [i for idx in profiles.gunport_bands(P, 0) for i in idx]
    assert len(seen) == len(set(seen))


def test_the_aperture_is_exactly_one_row_tall():
    offsets = profiles.bulwark_row_offsets(P)
    r = profiles.gunport_rows(P)[0]
    assert offsets[r] == pytest.approx(P.gun_decks[0].sill)
    assert offsets[r + 1] == pytest.approx(P.gun_decks[0].sill + P.gun_decks[0].height)


def test_gunport_boxes_are_exactly_port_sized():
    """The box the face selection runs against. It is derived from the grid
    seams, so if it ever came out wider than `port_w` the aperture would too."""
    boxes = profiles.gunport_boxes(P, 0)
    offsets = profiles.bulwark_row_offsets(P)
    r = profiles.gunport_rows(P)[0]
    assert len(boxes) == P.gun_decks[0].n_ports
    for (fwd, aft), (y_aft, y_fwd, z_lo, z_hi) in zip(profiles.port_edge_ts(P, 0), boxes):
        assert y_fwd == pytest.approx(profiles.station_y(P, fwd))
        assert y_aft == pytest.approx(profiles.station_y(P, aft))
        assert y_fwd > y_aft, "forward edge must sit at greater y"
        assert y_fwd - y_aft == pytest.approx(P.gun_decks[0].width)
        assert (z_lo, z_hi) == (offsets[r], offsets[r + 1])


def test_gunport_boxes_do_not_overlap():
    ys = sorted(profiles.gunport_boxes(P, 0))
    for (a_aft, a_fwd, _, _), (b_aft, b_fwd, _, _) in zip(ys, ys[1:]):
        assert a_fwd <= b_aft + 1e-9, "two apertures overlap in y"


def test_the_middle_rail_stands_clear_of_both_the_cap_and_the_top_rail():
    """Both endpoints named at every stanchion station of both runs:
    bulwark-cap-to-middle-rail-underside, and middle-rail-top-to-underside-of-
    top-rail. Neither may close up."""
    for t0, t1 in profiles.rail_runs(P):
        for t in profiles.stanchion_ts(P, t0, t1):
            cap = profiles.sheer(P, t) + P.bulwark_h
            under = profiles.rail_top_z(P, t) - P.rail_form.rail_t
            mid = profiles.rail_mid_z(P, t)
            assert mid - P.rail_form.midrail_t / 2 > cap
            assert mid + P.rail_form.midrail_t / 2 < under


def test_the_lower_gap_of_the_open_rail_is_the_smaller_one():
    """A man goes through the gap he can fall through, and that is the one over
    the cap, so cap-to-middle-rail must be shorter than middle-rail-to-top-rail.
    A middle rail placed at or above half height guards nothing."""
    for t0, t1 in profiles.rail_runs(P):
        for t in profiles.stanchion_ts(P, t0, t1):
            cap = profiles.sheer(P, t) + P.bulwark_h
            under = profiles.rail_top_z(P, t) - P.rail_form.rail_t
            mid = profiles.rail_mid_z(P, t)
            assert mid - cap < under - mid


# --- the hull's hard edges ---------------------------------------------------
#
# These are the edges that must be creased in the limit surface AND split in the
# shading. Creasing without splitting is what put the black wedge on the stem.


def _hard(ring_len, n_rings):
    return profiles.hull_hard_edges(ring_len, n_rings)


def test_the_hard_edge_set_is_both_gunwales_and_both_end_cap_rims():
    for ring_len, n_rings in ((28, 25), (20, 35), (6, 4), (3, 2)):
        expected = 2 * (n_rings - 1) + 2 * ring_len
        assert len(_hard(ring_len, n_rings)) == expected


def test_the_real_hull_has_the_104_hard_edges_the_mesh_carries():
    """P is the shipped frigate: 24 stations plus the maximum-beam station is
    25 rings of 28 points. The cage carries 104 creased edges and this is the
    arithmetic that must produce exactly that set."""
    n_rings = len(profiles.station_ts(P))
    ring_len = 2 * P.pts_per_half
    assert (n_rings, ring_len) == (25, 28)
    assert len(_hard(ring_len, n_rings)) == 104


def test_every_hard_edge_joins_two_distinct_vertices_that_exist():
    ring_len, n_rings = 28, 25
    for e in _hard(ring_len, n_rings):
        assert len(e) == 2
        for v in e:
            assert 0 <= v < ring_len * n_rings


def test_a_gunwale_edge_runs_between_neighbouring_stations_at_one_sheer_index():
    ring_len, n_rings = 28, 25
    longitudinal = [e for e in _hard(ring_len, n_rings)
                    if len({v // ring_len for v in e}) == 2]
    assert len(longitudinal) == 2 * (n_rings - 1)
    for e in longitudinal:
        stations = sorted(v // ring_len for v in e)
        indices = {v % ring_len for v in e}
        assert stations[1] - stations[0] == 1
        assert len(indices) == 1 and indices <= {0, ring_len - 1}


def test_a_cap_edge_lies_inside_one_end_station_and_closes_its_ring():
    ring_len, n_rings = 28, 25
    for s in (0, n_rings - 1):
        base = s * ring_len
        rim = {frozenset((base + i, base + (i + 1) % ring_len)) for i in range(ring_len)}
        assert rim <= _hard(ring_len, n_rings)
        # closed: every point of the rim is used by exactly two rim edges
        from collections import Counter
        used = Counter(v for e in rim for v in e)
        assert set(used.values()) == {2}


def test_no_edge_of_a_mid_body_station_is_hard():
    """The midbody planking is a smooth surface. If a ring edge amidships ever
    came back hard the hull would grow a chine, which no real hull has."""
    ring_len, n_rings = 28, 25
    hard = _hard(ring_len, n_rings)
    for s in range(1, n_rings - 1):
        base = s * ring_len
        for i in range(ring_len):
            assert frozenset((base + i, base + (i + 1) % ring_len)) not in hard


def test_no_longitudinal_run_below_the_sheer_is_hard():
    ring_len, n_rings = 28, 25
    hard = _hard(ring_len, n_rings)
    for i in range(1, ring_len - 1):
        for s in range(n_rings - 1):
            assert frozenset((s * ring_len + i, (s + 1) * ring_len + i)) not in hard


def test_a_degenerate_loft_is_refused_rather_than_silently_producing_nothing():
    import pytest
    with pytest.raises(ValueError):
        profiles.hull_hard_edges(2, 25)
    with pytest.raises(ValueError):
        profiles.hull_hard_edges(28, 1)
