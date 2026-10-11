import math
import pytest
from frigate.params import FrigateParams


def test_defaults_match_spec():
    p = FrigateParams()
    assert p.loa == 38.0
    assert p.beam == 10.2
    assert p.draft == 4.5
    assert p.deck_z == 2.7
    assert p.half_beam == pytest.approx(5.1)
    assert p.half_loa == pytest.approx(19.0)


@pytest.mark.parametrize("field", ["loa", "lwl", "beam", "draft"])
def test_non_positive_dimension_is_rejected(field):
    p = FrigateParams(**{field: 0.0})
    with pytest.raises(ValueError, match=field):
        p.validate()
    p = FrigateParams(**{field: -1.0})
    with pytest.raises(ValueError, match=field):
        p.validate()


def test_max_beam_station_must_lie_inside_hull():
    with pytest.raises(ValueError, match="max_beam_t"):
        FrigateParams(max_beam_t=1.4).validate()


def test_station_count_floor():
    with pytest.raises(ValueError, match="n_stations"):
        FrigateParams(n_stations=1).validate()
