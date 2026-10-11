"""The guard that refuses a blank bake, under plain pytest. No bpy here.

The project's Review Focus names the failure these tests exist for: a green
export of empty textures. Every test below is written as the mutant it is
meant to catch.
"""

import pytest

from frigate import texstats
from frigate.texstats import ChannelStats, TextureStats

SIZE = 2048


def _chan(lo=0.02, hi=0.94, mean=0.42, std=0.19, modal=0.11):
    return ChannelStats(lo=lo, hi=hi, mean=mean, std=std, modal_share=modal)


def _tex(name="albedo", kind="albedo", covered=None, channels=None,
         width=SIZE, height=SIZE):
    total = width * height
    return TextureStats(
        name=name, kind=kind, width=width, height=height,
        covered=total * 7 // 10 if covered is None else covered,
        total=total,
        channels=tuple(channels or (_chan(), _chan(), _chan(), _chan())),
    )


def _good_set():
    return [
        _tex("hull_albedo", "albedo"),
        _tex("hull_normal", "normal",
             channels=(_chan(0.31, 0.72, 0.5, 0.04, 0.3),
                       _chan(0.29, 0.69, 0.5, 0.04, 0.3),
                       _chan(0.93, 1.0, 0.98, 0.01, 0.6), _chan())),
        _tex("hull_roughness", "roughness",
             channels=(_chan(0.55, 0.92, 0.7, 0.07, 0.2),) * 4),
    ]


def test_a_real_bake_passes():
    assert texstats.verdict(_good_set(), SIZE) == []


def test_an_untouched_image_is_caught_and_says_so_in_words():
    """The mutant: the bake silently did nothing and every texel is still the
    sentinel. This is the exact shape of the shipped-untextured failure."""
    bad = _tex("hull_albedo", "albedo", covered=0)
    reasons = texstats.faults(bad, SIZE)
    assert reasons and "NOTHING WAS BAKED" in reasons[0]


def test_a_uniform_fill_is_caught_even_though_it_covers_the_whole_atlas():
    """The nastier mutant: the bake ran, wrote every texel, and wrote the same
    value to all of them. Coverage alone would call that a success."""
    flat = _tex("hull_albedo", "albedo", covered=SIZE * SIZE,
                channels=(ChannelStats(0.5, 0.5, 0.5, 0.0, 1.0),) * 4)
    reasons = texstats.faults(flat, SIZE)
    assert any("FLAT" in r for r in reasons)
    assert any("no variation" in r for r in reasons)
    assert any("one single value" in r for r in reasons)


def test_a_flat_normal_map_is_caught():
    """A normal bake that produced nothing but (0.5, 0.5, 1.0) is a normal map
    with no normals in it, and it looks entirely plausible in a thumbnail."""
    flat = _tex("hull_normal", "normal",
                channels=(ChannelStats(0.5, 0.5, 0.5, 0.0, 1.0),
                          ChannelStats(0.5, 0.5, 0.5, 0.0, 1.0),
                          ChannelStats(1.0, 1.0, 1.0, 0.0, 1.0), _chan()))
    assert texstats.faults(flat, SIZE)


def test_a_correct_normal_map_is_not_condemned_for_its_blue_channel():
    """The blue channel of a normal map IS nearly constant over every flat face
    on the ship. A guard that judged all channels equally would fail every
    correct normal bake, and would then get loosened — which is how this
    project has been caught before."""
    ok = _tex("hull_normal", "normal",
              channels=(_chan(0.33, 0.68, 0.5, 0.03, 0.4),
                        _chan(0.34, 0.66, 0.5, 0.03, 0.4),
                        ChannelStats(0.999, 1.0, 1.0, 0.0, 1.0), _chan()))
    assert texstats.faults(ok, SIZE) == []


def test_a_greyscale_roughness_bake_is_judged_on_one_channel():
    ok = _tex("hull_rough", "roughness",
              channels=(_chan(0.52, 0.93, 0.7, 0.08, 0.15),
                        ChannelStats(0.0, 0.0, 0.0, 0.0, 1.0),
                        ChannelStats(0.0, 0.0, 0.0, 0.0, 1.0), _chan()))
    assert texstats.faults(ok, SIZE) == []


def test_black_is_not_mistaken_for_empty():
    """The wales bake BLACK and they are supposed to. A guard that treats black
    as blank condemns the one part of the paint scheme the reference is most
    specific about — which is why the sentinel is magenta and not black."""
    assert texstats.SENTINEL[0] == 1.0 and texstats.SENTINEL[1] == 0.0
    dark = _tex("hull_albedo", "albedo",
                channels=(_chan(0.0, 0.31, 0.04, 0.05, 0.4),) * 4)
    assert texstats.faults(dark, SIZE) == []


def test_an_almost_empty_atlas_is_caught():
    tiny = _tex("hull_albedo", "albedo", covered=400)
    assert any("of the atlas was baked" in r for r in texstats.faults(tiny, SIZE))


def test_the_wrong_resolution_is_caught():
    small = _tex("hull_albedo", "albedo", width=512, height=512)
    assert any("512x512" in r for r in texstats.faults(small, SIZE))


def test_a_missing_kind_fails_the_whole_set():
    """A set with no normal map is as untextured, where it matters, as a set
    whose normal map is blank."""
    partial = [s for s in _good_set() if s.kind != "normal"]
    reasons = texstats.verdict(partial, SIZE)
    assert any("no normal bake at all" in r for r in reasons)


def test_every_declared_kind_has_live_channels_and_nothing_else_does():
    assert set(texstats.LIVE_CHANNELS) == set(texstats.KINDS)
    for kind, chans in texstats.LIVE_CHANNELS.items():
        assert chans and all(0 <= c < 4 for c in chans), kind


def test_an_unknown_kind_is_refused_rather_than_waved_through():
    assert texstats.faults(_tex("x", "specular"), SIZE)


def test_a_reason_always_names_the_texture_it_is_about():
    for bad in (_tex("hull_albedo", "albedo", covered=0),
                _tex("hull_albedo", "albedo", width=512, height=512),
                _tex("hull_albedo", "albedo", covered=400)):
        for r in texstats.faults(bad, SIZE):
            assert r.startswith("hull_albedo:")


def test_coverage_is_a_fraction_of_the_whole_atlas():
    s = _tex(covered=SIZE * SIZE // 4)
    assert s.coverage == pytest.approx(0.25)
    empty = TextureStats("e", "albedo", 0, 0, 0, 0, ())
    assert empty.coverage == 0.0
    assert texstats.faults(empty, SIZE)


def test_the_unused_atlas_is_painted_out_rather_than_left_magenta():
    """The sentinel is a colour that screams, which is what makes it useful for
    the measurement and intolerable in the shipped file: at low mip levels a
    fifth of a 2048 atlas being magenta averages magenta into every edge texel
    on the ship."""
    fill = texstats.background_fill("albedo", (0.3, 0.25, 0.2))
    assert fill[:3] == (0.3, 0.25, 0.2)
    assert fill != texstats.SENTINEL


def test_a_normal_maps_unused_space_becomes_flat_tangent_space():
    """Not the mean. The mean of a normal map is a direction nothing points in,
    and it would tilt every mip level of every silhouette edge."""
    assert texstats.background_fill("normal", (0.9, 0.1, 0.4)) == (0.5, 0.5, 1.0, 1.0)


def test_an_unknown_kind_has_no_fill():
    with pytest.raises(ValueError):
        texstats.background_fill("specular", (0.5, 0.5, 0.5))
