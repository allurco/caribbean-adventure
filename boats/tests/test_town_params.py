"""The tavern's parameters: pure data, validated before anything is built.

`TavernParams` states the piece in real metres (ADR 0002 amendment (d)): the
plan the board's layout plans with, the storeys, the roof, and the dressing
the reference asks for (#392's target look). `validate()` refuses a record
that would build inverted or overlapping geometry, so a bad edit fails here
rather than as a broken model.
"""

from dataclasses import replace

import pytest

from town.params import STYLES, TavernParams


def test_the_default_tavern_validates():
    TavernParams().validate()


def test_the_first_style_is_england():
    assert TavernParams().style == "england"
    assert "england" in STYLES


def test_the_file_is_named_after_the_piece():
    assert TavernParams().asset_stem == "tavern"


@pytest.mark.parametrize("field", ["half_width", "half_depth", "height",
                                   "footing", "ground_storey", "upper_storey"])
def test_lengths_must_be_positive(field):
    with pytest.raises(ValueError, match=field):
        replace(TavernParams(), **{field: 0.0}).validate()


def test_an_unknown_style_is_refused():
    with pytest.raises(ValueError, match="style"):
        replace(TavernParams(), style="atlantis").validate()


def test_the_storeys_must_leave_room_for_the_roof():
    p = TavernParams()
    with pytest.raises(ValueError, match="roof"):
        replace(p, upper_storey=p.height).validate()


def test_the_chimney_must_stand_inside_the_gables():
    p = TavernParams()
    with pytest.raises(ValueError, match="chimney"):
        replace(p, chimney_x=p.half_width + 1.0).validate()


def test_the_sign_hangs_clear_of_the_ground():
    with pytest.raises(ValueError, match="sign"):
        replace(TavernParams(), sign_height=0.5).validate()


def test_the_jetty_cannot_reach_past_the_roof_overhang():
    p = TavernParams()
    with pytest.raises(ValueError, match="jetty"):
        replace(p, jetty=p.eave_overhang + 0.1).validate()


# --- the look, tunable (#394's review) ---------------------------------------

RELIEF = ("course_recess", "member", "rail", "row_step")


def test_the_relief_is_chunky_as_the_reference_is():
    # Deep enough to read at ship zoom, where the whole tavern is some 60 px:
    # a quarter to two fifths of a metre, not a few centimetres.
    p = TavernParams()
    for name in RELIEF:
        assert 0.25 <= getattr(p, name) <= 0.4, name


@pytest.mark.parametrize("field", RELIEF)
def test_a_relief_depth_must_be_positive(field):
    with pytest.raises(ValueError, match=field):
        replace(TavernParams(), **{field: 0.0}).validate()


def test_the_course_recess_stays_inside_the_walls():
    with pytest.raises(ValueError, match="course_recess"):
        replace(TavernParams(), course_recess=1.0).validate()


def test_the_colours_come_from_the_styles_palette_unless_given():
    from town.palette import PALETTES
    p = TavernParams()
    assert p.colours() is PALETTES["england"]
    own = replace(PALETTES["england"], roof=0xFFFFFF)
    assert replace(p, palette=own).colours() is own
