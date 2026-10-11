"""The ship-type model: what distinguishes one hull from another, as data.

This is the layer the galleon, the schooner and the man-o-war are written in.
Its job is to make the five things that were hardcoded for the frigate into
things a ship type states: how many gunports a side, how many ROWS of them,
how many masts, what each mast CARRIES, and how the stern castle is massed.

The schooner is the hardest of the four and is scheduled last, so its
fore-and-aft rig is sketched here, now, as the test of the abstraction.
"""

import pytest

from frigate import shiptype as st


# --- sail kinds -------------------------------------------------------------


def test_the_four_sail_kinds_a_pirate_fleet_needs_all_exist():
    names = {k.name for k in st.SailKind}
    assert {"SQUARE", "GAFF", "LATEEN", "STAYSAIL"} <= names


def test_square_is_not_the_only_kind_that_can_be_asked_for():
    # The whole point: nothing may assume SQUARE. A schooner has none at all.
    assert len([k for k in st.SailKind if k is not st.SailKind.SQUARE]) >= 3


def test_every_sail_kind_declares_whether_it_is_fore_and_aft():
    for kind in st.SailKind:
        assert isinstance(st.is_fore_and_aft(kind), bool)
    assert st.is_fore_and_aft(st.SailKind.SQUARE) is False
    assert st.is_fore_and_aft(st.SailKind.GAFF) is True
    assert st.is_fore_and_aft(st.SailKind.LATEEN) is True
    assert st.is_fore_and_aft(st.SailKind.STAYSAIL) is True


def test_every_sail_kind_declares_the_spars_it_hangs_from():
    assert st.spars_for(st.SailKind.SQUARE) == (st.SparKind.YARD,)
    assert st.spars_for(st.SailKind.GAFF) == (st.SparKind.GAFF, st.SparKind.BOOM)
    assert st.spars_for(st.SailKind.LATEEN) == (st.SparKind.LATEEN_YARD,)
    # A staysail hangs on a STAY, which is standing rigging, not a spar.
    assert st.spars_for(st.SailKind.STAYSAIL) == ()


def test_a_triangular_sail_declares_which_corner_it_is_degenerate_at():
    # A quadrilateral sail has four distinct corners. A triangular one is the
    # same quad with two corners coincident, and the model says WHICH, so a
    # consumer never has to guess where the duplicate is.
    assert st.degenerate_corner(st.SailKind.SQUARE) is None
    assert st.degenerate_corner(st.SailKind.GAFF) is None
    assert st.degenerate_corner(st.SailKind.STAYSAIL) == "head"
    assert st.degenerate_corner(st.SailKind.LATEEN) == "tack"


def test_every_sail_kind_names_the_running_rigging_it_needs():
    square = st.rope_families(st.SailKind.SQUARE)
    assert "brace" in square and "clewline" in square
    gaff = st.rope_families(st.SailKind.GAFF)
    assert "throat_halyard" in gaff and "peak_halyard" in gaff
    assert "boom_sheet" in gaff and "vang" in gaff
    # A gaff sail has no yard, so it can have no brace.
    assert "brace" not in gaff
    assert "brace" not in st.rope_families(st.SailKind.STAYSAIL)
    assert "brace" not in st.rope_families(st.SailKind.LATEEN)


# --- gun decks: plural from the start ---------------------------------------


def test_a_gun_deck_is_one_row_of_ports_and_a_ship_carries_a_tuple_of_them():
    row = st.GunDeck(name="upper", n_ports=11, t0=0.22, t1=0.84,
                     width=0.90, height=0.75, sill=0.55)
    assert row.n_ports == 11
    assert row.name == "upper"


def test_a_two_decker_is_expressible_without_touching_any_code():
    rows = (
        st.GunDeck("upper", 14, 0.20, 0.86, 0.90, 0.75, 0.55),
        st.GunDeck("lower", 14, 0.20, 0.86, 1.00, 0.85, -1.60),
    )
    assert len(rows) == 2
    assert sum(r.n_ports for r in rows) == 28


def test_a_gun_deck_rejects_a_single_port_because_the_spacing_would_divide_by_zero():
    with pytest.raises(ValueError, match="at least 2"):
        st.GunDeck("silly", 1, 0.2, 0.8, 0.9, 0.75, 0.55).validate()


def test_a_gun_deck_rejects_stations_outside_the_hull():
    with pytest.raises(ValueError, match="0 < t0 < t1 < 1"):
        st.GunDeck("silly", 4, 0.9, 0.2, 0.9, 0.75, 0.55).validate()


def test_two_rows_sharing_one_sill_is_rejected_because_they_would_cut_each_other():
    a = st.GunDeck("upper", 8, 0.2, 0.8, 0.9, 0.75, 0.55)
    b = st.GunDeck("lower", 8, 0.2, 0.8, 0.9, 0.75, 0.55)
    with pytest.raises(ValueError, match="overlap"):
        st.validate_gun_decks((a, b))


def test_two_rows_that_clear_each_other_vertically_are_accepted():
    a = st.GunDeck("upper", 8, 0.2, 0.8, 0.9, 0.75, 0.55)
    b = st.GunDeck("lower", 8, 0.2, 0.8, 0.9, 0.75, -1.60)
    st.validate_gun_decks((a, b))   # must not raise


# --- masts: a list, not three names -----------------------------------------


def test_a_mast_carries_its_own_sails_rather_than_a_tier_count():
    m = st.Mast(name="main", t=0.554, truck_frac=0.947, rake_deg=1.5,
                radius=0.42, top_span=5.0, yard_scale=1.0,
                channel_len=3.6, chainplates=6,
                sails=(st.Sail(st.SailKind.SQUARE, 0),
                       st.Sail(st.SailKind.SQUARE, 1),
                       st.Sail(st.SailKind.SQUARE, 2)))
    assert len(m.sails) == 3
    assert all(s.kind is st.SailKind.SQUARE for s in m.sails)


def test_a_two_masted_rig_is_expressible():
    rig = st.RigPlan(masts=(
        st.Mast("fore", 0.30, 0.90, 0.0, 0.34, 0.0, 1.0, 2.8, 5,
                sails=(st.Sail(st.SailKind.GAFF, 0),)),
        st.Mast("main", 0.66, 1.00, 2.0, 0.36, 0.0, 1.0, 3.0, 5,
                sails=(st.Sail(st.SailKind.GAFF, 0),)),
    ))
    assert len(rig.masts) == 2


def test_mast_names_come_back_forward_to_aft_whatever_order_they_were_given():
    rig = st.RigPlan(masts=(
        st.Mast("main", 0.66, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5, sails=()),
        st.Mast("fore", 0.30, 0.9, 0.0, 0.3, 0.0, 1.0, 2.8, 5, sails=()),
    ))
    assert rig.mast_names() == ("fore", "main")


def test_a_rig_rejects_two_masts_at_the_same_station():
    with pytest.raises(ValueError, match="same station"):
        st.RigPlan(masts=(
            st.Mast("a", 0.5, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5, sails=()),
            st.Mast("b", 0.5, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5, sails=()),
        )).validate()


def test_a_rig_rejects_two_masts_with_the_same_name():
    with pytest.raises(ValueError, match="twice"):
        st.RigPlan(masts=(
            st.Mast("main", 0.4, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5, sails=()),
            st.Mast("main", 0.6, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5, sails=()),
        )).validate()


def test_a_rig_rejects_two_sails_claiming_the_same_tier_on_one_mast():
    with pytest.raises(ValueError, match="tier"):
        st.RigPlan(masts=(
            st.Mast("main", 0.5, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5,
                    sails=(st.Sail(st.SailKind.SQUARE, 0),
                           st.Sail(st.SailKind.SQUARE, 0))),
        )).validate()


def test_a_rig_reports_whether_it_is_square_rigged_at_all():
    square = st.RigPlan(masts=(
        st.Mast("main", 0.5, 1.0, 0.0, 0.3, 4.0, 1.0, 3.0, 5,
                sails=(st.Sail(st.SailKind.SQUARE, 0),)),
    ))
    fore_aft = st.RigPlan(masts=(
        st.Mast("main", 0.5, 1.0, 0.0, 0.3, 0.0, 1.0, 3.0, 5,
                sails=(st.Sail(st.SailKind.GAFF, 0),)),
    ))
    assert square.has_square_sails() is True
    assert fore_aft.has_square_sails() is False


def test_headsails_hang_on_the_ship_not_on_a_mast():
    # A jib's tack is on the bowsprit and its head is up a stay. It belongs to
    # no mast, so a model that only has sails-per-mast cannot express one.
    rig = st.RigPlan(
        masts=(st.Mast("fore", 0.3, 0.9, 0.0, 0.3, 0.0, 1.0, 2.8, 5, sails=()),),
        headsails=(st.Sail(st.SailKind.STAYSAIL, 0, name="jib"),
                   st.Sail(st.SailKind.STAYSAIL, 1, name="flying_jib")),
    )
    assert len(rig.headsails) == 2
    assert all(s.kind is st.SailKind.STAYSAIL for s in rig.headsails)


# --- the registry -----------------------------------------------------------


def test_the_frigate_is_in_the_registry_and_is_square_rigged_on_three_masts():
    rig = st.SHIP_RIGS["frigate"]
    assert rig.mast_names() == ("fore", "main", "mizzen")
    assert rig.has_square_sails() is True
    assert all(len(m.sails) == 3 for m in rig.masts)


def test_the_frigates_rig_plan_reproduces_the_numbers_the_built_ship_uses():
    rig = st.SHIP_RIGS["frigate"]
    by_name = {m.name: m for m in rig.masts}
    assert by_name["fore"].t == 0.184
    assert by_name["main"].t == 0.554
    assert by_name["mizzen"].t == 0.801
    assert by_name["main"].truck_frac == 0.947
    assert by_name["mizzen"].rake_deg == 2.5
    assert by_name["fore"].radius == 0.39
    assert by_name["main"].top_span == 5.0
    assert by_name["mizzen"].yard_scale == 0.72
    assert by_name["main"].channel_len == 3.6
    assert by_name["fore"].chainplates == 5


# --- THE TEST OF THE ABSTRACTION: the schooner, built last, sketched now -----


def test_the_schooner_rig_is_expressible_and_carries_no_square_sail():
    rig = st.SHIP_RIGS["schooner"]
    assert rig.mast_names() == ("fore", "main")
    assert rig.has_square_sails() is False


def test_the_schooner_sets_a_gaff_and_boom_mainsail_on_each_mast():
    rig = st.SHIP_RIGS["schooner"]
    for mast in rig.masts:
        lowest = min(mast.sails, key=lambda s: s.tier)
        assert lowest.kind is st.SailKind.GAFF
        assert st.spars_for(lowest.kind) == (st.SparKind.GAFF, st.SparKind.BOOM)


def test_the_schooner_sets_triangular_headsails():
    rig = st.SHIP_RIGS["schooner"]
    assert len(rig.headsails) >= 2
    for sail in rig.headsails:
        assert sail.kind is st.SailKind.STAYSAIL
        assert st.degenerate_corner(sail.kind) == "head"


def test_the_schooner_needs_no_brace_and_no_yard_anywhere_in_its_rig():
    rig = st.SHIP_RIGS["schooner"]
    assert st.SparKind.YARD not in rig.spar_kinds()
    assert "brace" not in rig.rope_kinds()
    assert "clewline" not in rig.rope_kinds()


def test_the_schooner_needs_the_fore_and_aft_running_rigging_a_square_rig_lacks():
    schooner = st.SHIP_RIGS["schooner"].rope_kinds()
    frigate = st.SHIP_RIGS["frigate"].rope_kinds()
    for kind in ("throat_halyard", "peak_halyard", "boom_sheet", "vang"):
        assert kind in schooner
        assert kind not in frigate


def test_the_galleons_lateen_mizzen_is_expressible_on_the_same_model():
    rig = st.SHIP_RIGS["galleon"]
    mizzen = {m.name: m for m in rig.masts}["mizzen"]
    assert mizzen.sails[0].kind is st.SailKind.LATEEN
    assert st.spars_for(st.SailKind.LATEEN) == (st.SparKind.LATEEN_YARD,)
    # and the galleon is still square-rigged forward of it
    assert rig.has_square_sails() is True


def test_every_registered_rig_validates():
    for name, rig in st.SHIP_RIGS.items():
        rig.validate()
