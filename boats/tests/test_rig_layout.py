"""Task 7 — mast stations, channels, chainplates and the open rail. Pure, no bpy.

Every figure here is measured off `La-penelope.webp` with the scale fixed by two
NAMED landmarks: the stem at rail level (x=392 px) to the taffrail (x=1062 px) is
670 px for 38.0 m of length overall, i.e. 17.63 px/m. The waterline runs at
y=719 px. Quoting a distance without saying what it spans has produced three
wrong figures in this project; the ledger names them.
"""

import pytest

from frigate.params import FrigateParams
from frigate import profiles


@pytest.fixture
def p():
    return FrigateParams()


# --- mast stations ----------------------------------------------------------

def test_three_masts_run_forward_to_aft(p):
    names = profiles.mast_names(p)
    assert names == ("fore", "main", "mizzen")
    ts = [profiles.mast_t(p, n) for n in names]
    assert ts == sorted(ts)


def test_mast_stations_match_the_reference_painting(p):
    """Mast foot to stem, as a fraction of stem-to-taffrail. Measured: foremast
    foot x=515 px, mainmast x=763, mizzen x=929, over 392..1062."""
    for name, expected in (("fore", 0.184), ("main", 0.554), ("mizzen", 0.801)):
        assert profiles.mast_t(p, name) == pytest.approx(expected, abs=0.02)


def test_every_mast_stands_on_the_hull_clear_of_the_ends(p):
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        assert 0.05 < t < 0.95
        assert profiles.deck_half_beam(p, t) > 1.0


def test_an_unknown_mast_raises_rather_than_defaulting(p):
    with pytest.raises(KeyError):
        profiles.mast_t(p, "jigger")


# --- channels ---------------------------------------------------------------

def test_channel_clears_the_gunport_head(p):
    """A channel lapping over a port would jam the gun. Our ports sit high in the
    bulwark (the ratified Task 4 deviation), so the channel rides just under the
    rail cap rather than at the reference's mid-topside height."""
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        head = profiles.sheer(p, t) + p.gun_decks[0].sill + p.gun_decks[0].height
        assert profiles.channel_z(p, t) > head


def test_channel_sits_below_the_rail_cap(p):
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        assert profiles.channel_z(p, t) < profiles.sheer(p, t) + p.bulwark_h


def test_the_channel_UNDERSIDE_also_clears_the_gunport_head(p):
    """Both edges of the plate, not just the one channel_z returns. The whole
    channel has to live in the 0.30 m band between the port head and the rail
    cap, and testing only the top let a plate through whose underside lapped
    10 mm over the port."""
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        head = profiles.sheer(p, t) + p.gun_decks[0].sill + p.gun_decks[0].height
        assert profiles.channel_z(p, t) - p.rail_form.channel_thick > head


def test_the_rail_rise_comes_from_the_platform_not_the_rail_run(p):
    """The end stanchion's timber reaches past the rail run's end; the platform
    under it has not stopped, so the rail height must not step there."""
    for (r0, r1), (q0, q1, _rise) in zip(profiles.rail_runs(p), profiles.platform_runs(p)):
        assert q0 <= r0 and r1 <= q1


def test_channel_is_biased_aft_of_its_mast_as_the_reference_shows(p):
    """Main channel spans x=738..806 px about a mast at 763: 0.37 of its length
    forward of the mast, the rest aft, because the shrouds lead aft."""
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        t_fwd, t_aft = profiles.channel_span(p, name)
        assert t_fwd < t < t_aft
        forward_fraction = (t - t_fwd) / (t_aft - t_fwd)
        assert 0.25 < forward_fraction < 0.45


def test_channel_lengths_fall_off_from_main_to_mizzen(p):
    def length(name):
        t_fwd, t_aft = profiles.channel_span(p, name)
        return profiles.station_y(p, t_fwd) - profiles.station_y(p, t_aft)

    assert length("main") > length("fore") > length("mizzen")
    assert length("main") == pytest.approx(3.6, abs=0.05)


def test_channels_stay_on_the_hull_and_do_not_overlap(p):
    spans = [profiles.channel_span(p, n) for n in profiles.mast_names(p)]
    assert 0.0 < spans[0][0]
    assert spans[-1][1] < 1.0
    for (_f0, a0), (f1, _a1) in zip(spans, spans[1:]):
        assert a0 < f1


def test_channel_outer_edge_stands_proud_of_the_hull_skin(p):
    for name in profiles.mast_names(p):
        t = profiles.mast_t(p, name)
        z = profiles.channel_z(p, t)
        inner = profiles.bulwark_half_width(p, t, z)
        assert profiles.channel_outer(p, t) == pytest.approx(
            inner + p.rail_form.channel_projection
        )


# --- chainplates ------------------------------------------------------------

def test_every_channel_carries_its_chainplates(p):
    total = 0
    for name in profiles.mast_names(p):
        feet = profiles.chainplate_segments(p, name)
        assert len(feet) == profiles.chainplate_count(p, name)
        total += len(feet)
    assert total == 15


def test_a_chainplate_hangs_from_the_channel_down_onto_the_hull(p):
    for name in profiles.mast_names(p):
        for top, foot in profiles.chainplate_segments(p, name):
            assert foot[2] < top[2]
            assert foot[1] < top[1], "the foot must lie aft of the head"
            assert abs(foot[0]) < abs(top[0]), "the foot must tuck inboard of the channel edge"


def test_a_chainplate_foot_lands_on_the_hull_skin_not_in_mid_air(p):
    for name in profiles.mast_names(p):
        for _top, foot in profiles.chainplate_segments(p, name):
            t = profiles.t_of_y(p, foot[1])
            assert abs(foot[0]) == pytest.approx(profiles.hull_half_width(p, t, foot[2]), abs=1e-9)


def test_a_chainplate_reaches_down_past_the_gunport_sill_onto_the_hull(p):
    """The strap must get below the port band onto the hull proper; a plate that
    stopped at the port head would be a 0.15 m stub, since our channel rides only
    that far above it."""
    for name in profiles.mast_names(p):
        for _top, foot in profiles.chainplate_segments(p, name):
            t = profiles.t_of_y(p, foot[1])
            assert foot[2] < profiles.sheer(p, t) + p.gun_decks[0].sill


def test_no_chainplate_crosses_a_gunport_aperture(p):
    """It falls through the whole port band, so it must land between two ports.
    Evenly spaced straps put one squarely across the foremost port."""
    half = 0.07
    for name in profiles.mast_names(p):
        for top, foot in profiles.chainplate_segments(p, name):
            for y in (top[1], foot[1]):
                for t_port in profiles.gunport_ts(p, 0):
                    y_port = profiles.station_y(p, t_port)
                    assert not (
                        y_port - p.gun_decks[0].width / 2 - half < y < y_port + p.gun_decks[0].width / 2 + half
                    ), f"{name} chainplate at y={y:.2f} crosses the port at y={y_port:.2f}"


def test_chainplates_are_spread_along_the_channel_not_stacked(p):
    for name in profiles.mast_names(p):
        ys = [top[1] for top, _foot in profiles.chainplate_segments(p, name)]
        assert ys == sorted(ys, reverse=True)
        assert all(a - b > 0.2 for a, b in zip(ys, ys[1:]))


# --- the open rail ----------------------------------------------------------

def test_the_rail_runs_over_the_two_raised_platforms_only(p):
    runs = profiles.rail_runs(p)
    assert len(runs) == 2
    (f0, f1), (q0, q1) = runs
    assert f0 < f1 <= p.fcastle_t
    assert p.quarter_t <= q0 < q1 < 1.0


def test_the_rail_gives_a_safe_height_over_each_platform(p):
    """The span that matters is rail-top-to-DECK-EDGE: that is where a man at the
    rail stands, and camber only lifts the deck further from the rail as you walk
    inboard. Over the quarterdeck the bulwark cap stands 0.18 m proud of the deck
    edge, so the cap alone is ankle height and the open rail is the whole guard."""
    for run, rise in zip(profiles.rail_runs(p), (p.fcastle_rise, p.quarter_rise)):
        t = (run[0] + run[1]) / 2
        edge_x = profiles.deck_half_beam(p, t)
        deck_edge = profiles.deck_z_at(p, t, edge_x, rise)
        cap = profiles.sheer(p, t) + p.bulwark_h
        assert cap - deck_edge < 0.8, "sanity: the bulwark alone is not enough here"
        assert profiles.rail_top_z(p, t) - deck_edge > 0.9


def test_an_end_stanchion_keeps_its_own_timber_over_its_platform(p):
    """A stanchion is 90 mm thick. Placed on the platform's edge, its outer face
    lands past the edge where rail_top_z steps 0.30 m, and that face then stands
    0.30 m above the rail it belongs to."""
    half = p.rail_form.stanchion_w / 2
    for (r0, r1), (q0, q1, _rise) in zip(profiles.rail_runs(p), profiles.platform_runs(p)):
        for t_end in (r0, r1):
            for y in (profiles.station_y(p, t_end) - half, profiles.station_y(p, t_end) + half):
                t_face = profiles.t_of_y(p, y)
                assert profiles.rail_top_z(p, t_face) == pytest.approx(
                    profiles.rail_top_z(p, t_end), abs=1e-2
                )


def test_stanchions_are_evenly_spread_and_reach_both_ends_of_a_run(p):
    for t0, t1 in profiles.rail_runs(p):
        ts = profiles.stanchion_ts(p, t0, t1)
        assert ts[0] == pytest.approx(t0)
        assert ts[-1] == pytest.approx(t1)
        gaps = [profiles.station_y(p, a) - profiles.station_y(p, b) for a, b in zip(ts, ts[1:])]
        assert max(gaps) - min(gaps) < 1e-9
        assert 0.8 < gaps[0] < 2.0


def test_the_rail_follows_the_sheer_rather_than_running_level(p):
    ends = [profiles.rail_top_z(p, t) for t in (0.03, 0.5, 0.97)]
    assert ends[0] > ends[1] < ends[2]


def test_the_rail_height_survives_a_y_to_t_round_trip_at_a_platform_edge(p):
    """rail_top_z steps 0.30 m where a platform ends and the quarterdeck rail
    begins exactly there. Blender stores vertex coordinates as float32, so a
    vertex emitted at y = -3.8 reads back as -3.799999952316284 and lands outside
    a closed interval that ends at that station."""
    import struct

    def as_float32(v):
        return struct.unpack("f", struct.pack("f", v))[0]

    for _t0, t1, _rise in profiles.platform_runs(p):
        for edge in (p.fcastle_t, p.quarter_t, t1):
            direct = profiles.rail_top_z(p, edge)
            stored_y = as_float32(profiles.station_y(p, edge))
            assert direct == pytest.approx(
                profiles.rail_top_z(p, profiles.t_of_y(p, stored_y)), abs=1e-6
            )
