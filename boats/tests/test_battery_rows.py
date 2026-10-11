"""Gunport ROWS, plural. One row is the special case of N, not the reverse.

`profiles.gunport_row() -> int` returned ONE row index and every consumer
indexed the bulwark grid with it. A man-o-war has two or three gun decks, so
the single row was architectural, not a number. These tests pin the plural
shape and prove a two-row battery comes out right in the pure-math layer,
where it can be proved without emitting a ship.
"""

import pytest

from frigate import profiles, shiptype as st
from frigate.params import FrigateParams, FRIGATE_DECK_TIERS

P = FrigateParams()


def _two_decker() -> FrigateParams:
    """A hull with a taller bulwark carrying TWO rows of ports a side.

    Both rows are cut in the bulwark, so both are provable through exactly the
    same grid the frigate uses. The lower row's head (0.30 + 0.62 = 0.92) stands
    clear of the upper row's sill (1.10), and the upper row's head
    (1.10 + 0.72 = 1.82) stands clear of the 2.30 m rail.
    """
    return FrigateParams(
        bulwark_h=2.30,
        gun_decks=(
            st.GunDeck("lower", 13, 0.20, 0.86, 0.86, 0.62, 0.30),
            st.GunDeck("upper", 11, 0.22, 0.84, 0.90, 0.72, 1.10),
        ),
        deck_tiers=FRIGATE_DECK_TIERS,
    )


# --- the frigate is one row, stated as one row ------------------------------


def test_the_frigate_declares_exactly_one_gun_deck_of_eleven_ports_a_side():
    assert len(P.gun_decks) == 1
    assert P.gun_decks[0].n_ports == 11


def test_gunport_rows_is_a_list_and_the_frigates_has_one_entry():
    rows = profiles.gunport_rows(P)
    assert isinstance(rows, list)
    assert rows == [1]


def test_the_frigates_bulwark_grid_is_unchanged_by_going_plural():
    assert profiles.bulwark_row_offsets(P) == [0.0, 0.55, 1.30, 1.6]


def test_the_frigates_port_stations_are_unchanged_by_going_plural():
    ts = profiles.gunport_ts(P, 0)
    assert len(ts) == 11
    assert ts[0] == pytest.approx(0.22)
    assert ts[-1] == pytest.approx(0.84)


def test_total_broadside_ports_counts_every_row_on_both_sides():
    assert profiles.total_broadside_ports(P) == 22


# --- two rows ---------------------------------------------------------------


def test_a_two_row_battery_puts_two_apertures_in_the_bulwark_grid():
    p = _two_decker()
    p.validate()
    assert len(profiles.gunport_rows(p)) == 2


def test_the_grid_grows_a_seam_pair_for_every_row_and_no_more():
    p = _two_decker()
    # keel, then sill/head for each row in ascending order, then the rail cap
    assert profiles.bulwark_row_offsets(p) == pytest.approx(
        [0.0, 0.30, 0.92, 1.10, 1.82, 2.30])


def test_each_row_is_found_at_its_own_sill_never_at_the_other_rows():
    p = _two_decker()
    offsets = profiles.bulwark_row_offsets(p)
    for deck, row in zip(profiles.bulwark_gun_decks(p), profiles.gunport_rows(p)):
        assert offsets[row] == pytest.approx(deck.sill)
        assert offsets[row + 1] == pytest.approx(deck.head)


def test_the_two_rows_take_different_rows_of_the_grid():
    p = _two_decker()
    rows = profiles.gunport_rows(p)
    assert len(set(rows)) == 2


def test_every_row_selects_bands_and_none_of_them_is_empty():
    p = _two_decker()
    for d in range(len(p.gun_decks)):
        bands = profiles.gunport_bands(p, d)
        assert len(bands) == p.gun_decks[d].n_ports
        assert all(band for band in bands)


def test_no_band_of_one_row_is_ever_a_band_of_the_other_at_the_same_height():
    """Two rows at the same stations must still be two SEPARATE apertures."""
    p = _two_decker()
    boxes_lo = profiles.gunport_boxes(p, 0)
    boxes_hi = profiles.gunport_boxes(p, 1)
    for _ya, _yf, z_lo, z_hi in boxes_lo:
        for _ya2, _yf2, z_lo2, z_hi2 in boxes_hi:
            assert z_hi <= z_lo2 or z_hi2 <= z_lo


def test_all_gunport_boxes_covers_every_row_and_tags_each_with_its_deck():
    p = _two_decker()
    tagged = profiles.all_gunport_boxes(p)
    assert len(tagged) == 13 + 11
    assert {d for d, _box in tagged} == {0, 1}


def test_a_two_decker_counts_both_rows_on_both_sides():
    assert profiles.total_broadside_ports(_two_decker()) == 2 * (13 + 11)


# --- the rows must not be allowed to collide --------------------------------


def test_a_row_whose_head_crosses_the_row_above_is_rejected_loudly():
    p = FrigateParams(
        bulwark_h=2.30,
        gun_decks=(
            st.GunDeck("lower", 13, 0.20, 0.86, 0.86, 0.90, 0.30),   # head 1.20
            st.GunDeck("upper", 11, 0.22, 0.84, 0.90, 0.72, 1.10),   # sill 1.10
        ),
        deck_tiers=FRIGATE_DECK_TIERS,
    )
    with pytest.raises(ValueError, match="overlap"):
        p.validate()


def test_a_row_breaking_the_rail_is_rejected_loudly():
    p = FrigateParams(gun_decks=(
        st.GunDeck("upper", 11, 0.22, 0.84, 0.90, 0.75, 1.20),   # head 1.95 > 1.6
    ), deck_tiers=FRIGATE_DECK_TIERS)
    with pytest.raises(ValueError, match="breaks the rail"):
        p.validate()


# --- the chase ports belong to a NAMED row, not to "the" row ----------------


def test_the_chase_ports_are_cut_at_the_uppermost_bulwark_row():
    p = _two_decker()
    assert profiles.chase_deck_index(p) == 1          # "upper"
    assert profiles.chase_row(p) == profiles.gunport_rows(p)[1]


def test_on_the_frigate_the_chase_row_is_the_only_row_there_is():
    assert profiles.chase_row(P) == profiles.gunport_rows(P)[0] == 1
