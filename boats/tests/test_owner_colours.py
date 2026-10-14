"""The owner's colours: a masthead PENNANT and a HULL STRIPE. No bpy.

The maintainer's ruling (issue #134, rewritten): the owner's colour goes on a
pennant, the flag and a hull stripe, and the sails stay plain canvas. Each of
the two new parts is its OWN mesh with its OWN plain white material, so the
game can tint it alone after it merges the file by material: white times the
owner's colour is the owner's colour. The flag (`Jolly_Roger`) stays as it is.

Every ship carries both, the frigate included.
"""

import math

import pytest

from frigate import board, budget, damage, owner, palette, profiles, wind
from frigate.params import (FluteParams, FrigateParams, GalleonParams,
                            SloopParams)

F, G, L, S = FrigateParams(), GalleonParams(), FluteParams(), SloopParams()
SHIPS = [F, G, L, S]
IDS = ["frigate", "galleon", "flute", "sloop"]


# --- the parts and their materials -------------------------------------------


def test_the_two_parts_are_named_for_the_catalogue():
    assert owner.PENNANT == "Pennant"
    assert owner.STRIPE == "Hull_Stripe"
    assert owner.TINTED_PARTS == ("Pennant", "Hull_Stripe", "Sail_Band")


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_each_part_wears_a_material_of_its_own_named_for_her(p):
    names = palette.tinted_material_names(p)
    assert names == {"Pennant": f"{p.collection}_Pennant",
                     "Hull_Stripe": f"{p.collection}_HullStripe",
                     "Sail_Band": f"{p.collection}_SailBand"}
    assert not set(names.values()) & set(palette.material_names(p).values())


def test_a_tinted_part_belongs_to_no_baked_family():
    for name in owner.TINTED_PARTS:
        assert palette.is_tinted(name)
        with pytest.raises(KeyError):
            palette.family_of(name)
    assert not palette.is_tinted("Hull")


def test_the_tint_base_is_white_so_a_multiply_reads_as_the_owner_s_colour():
    assert palette.TINT_BASE == (255, 255, 255)


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_both_parts_spend_a_line_of_her_budget(p):
    assert budget.component_of(p, "Pennant") == "sails"
    assert budget.component_of(p, "Hull_Stripe") == "hull"


def test_the_board_variant_names_both_and_never_thins_them():
    for name in owner.TINTED_PARTS:
        assert name in board.NAMED_PARTS
        assert name in board.WHOLE
    assert "Jolly_Roger" in board.NAMED_PARTS


# --- the pennant ---------------------------------------------------------------


def test_the_pennant_flies_from_the_tallest_truck_that_does_not_fly_the_flag():
    assert owner.pennant_mast(F) == "main"
    assert owner.pennant_mast(G) == "main"
    assert owner.pennant_mast(L) == "main"
    assert wind.flag_mast(F) == "mizzen"


def test_on_a_one_masted_ship_the_pennant_takes_the_truck_over_the_flag():
    """The sloop's one mast flies both: the pennant at the truck, and the
    flag's HEAD dropped under the pennant's HOIST by `owner.PENNANT_GAP`."""
    assert owner.pennant_mast(S) == wind.flag_mast(S) == "main"
    truck = profiles.mast_truck_z(S, "main")
    assert owner.pennant_staff(S)[2] == pytest.approx(truck)
    assert wind.flag_staff(S)[2] == pytest.approx(
        truck - owner.pennant_hoist(S) - owner.PENNANT_GAP)


def test_the_frigates_flag_does_not_move():
    truck = profiles.mast_truck_z(F, "mizzen")
    assert wind.flag_staff(F) == profiles.mast_point(F, "mizzen", truck)


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_pennant_is_a_long_narrow_streamer_at_her_scale(p):
    grid = owner.pennant_grid(p)
    assert len(grid) == owner.PENNANT_NV
    assert all(len(row) == owner.PENNANT_NU for row in grid)
    top, bottom = grid[0], grid[-1]
    luff = top[0][2] - bottom[0][2]
    fly = math.dist(top[0][:2], top[-1][:2])
    assert luff == pytest.approx(owner.pennant_hoist(p))
    assert fly == pytest.approx(owner.PENNANT_FLY_FRAC * p.loa, rel=0.02)
    assert fly / luff > 12.0
    # it TAPERS to the fly
    assert top[-1][2] - bottom[-1][2] < 0.4 * luff


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_pennant_is_hoisted_at_its_truck_and_streams_downwind(p):
    grid = owner.pennant_grid(p)
    staff = owner.pennant_staff(p)
    assert grid[0][0] == pytest.approx(staff)
    dx, dy, _ = wind.wind_direction(p, staff[2])
    tip = grid[0][-1]
    assert (tip[0] - staff[0]) * dx + (tip[1] - staff[1]) * dy > 0.0


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_pennant_stands_wholly_above_her_flag(p):
    """PENNANT's lowest point over the FLAG's highest, so the two never
    cross on any ship."""
    flag = wind.flag_grid(p, profiles.FLAG_NU, profiles.FLAG_NV)
    if owner.pennant_mast(p) != wind.flag_mast(p):
        return
    low = min(pt[2] for row in owner.pennant_grid(p) for pt in row)
    high = max(pt[2] for row in flag for pt in row)
    assert low > high


# --- the hull stripe -----------------------------------------------------------


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_stripe_lies_under_her_sheer_on_her_wale(p):
    lo, hi = owner.stripe_band(p)
    assert lo < hi < 0.0
    assert hi - lo >= 0.25
    for t in owner.stripe_ts(p):
        assert profiles.sheer(p, t) + lo > palette.BOOT_TOP[1]


def test_the_frigates_stripe_is_on_her_main_wale():
    lo, hi = owner.stripe_band(F)
    wlo, whi = palette.MAIN_WALE
    assert wlo <= lo < hi <= whi


def test_the_galleons_stripe_is_on_her_lower_wale_under_her_hull_row():
    lo, hi = owner.stripe_band(G)
    (_n1, *_m), (_n2, wlo, whi) = palette.wale_bands(G)
    assert wlo <= lo < hi <= whi


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_stripe_runs_most_of_her_length_clear_of_her_anchor(p):
    ts = owner.stripe_ts(p)
    assert ts == sorted(ts)
    length = profiles.station_y(p, ts[0]) - profiles.station_y(p, ts[-1])
    assert length > 0.6 * p.loa
    anchor_aft = profiles.station_y(p, p.furniture_plan.anchor_t) \
        - profiles.ANCHOR_AFT_REACH
    assert profiles.station_y(p, ts[0]) < anchor_aft - 0.25
    # columns no further apart than the pitch
    for a, b in zip(ts, ts[1:]):
        assert profiles.station_y(p, a) - profiles.station_y(p, b) \
            <= owner.STRIPE_PITCH + 1e-9


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_every_hull_station_inside_the_stripe_is_one_of_its_columns(p):
    """The rendered skin bends hardest AT the hull's own stations (the
    sloop's max-beam pair stands 0.02 m apart), and a stripe chord laid
    across one cut into it by 12 face pairs. So a column stands on each."""
    t0, t1 = p.stripe_form.span
    ts = owner.stripe_ts(p)
    for t in profiles.station_ts(p):
        if t0 < t < t1:
            assert any(abs(t - c) < 1e-9 for c in ts), t


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_stripe_stays_off_every_hull_port(p):
    """Every aperture, any row, stands wholly over or wholly under the
    stripe's band at its own station."""
    lo, hi = owner.stripe_band(p)
    for y0, y1, z0, z1 in damage.aperture_boxes(p):
        t = profiles.t_of_y(p, (y0 + y1) / 2.0)
        sheer = profiles.sheer(p, t)
        assert z1 < sheer + lo or z0 > sheer + hi


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_a_shot_scar_shoots_its_stripe_away(p):
    """Where a crater lies under the stripe, the stripe's quad over it is
    left out: paint does not bridge a shot hole."""
    holes = owner.stripe_holes(p)
    if not p.builds("damage"):
        assert holes == set()
        return
    ts = owner.stripe_ts(p)
    lo, hi = owner.stripe_band(p)
    rows = owner.stripe_rows(p)
    for sign, i, j in holes:
        assert sign in (-1.0, 1.0)
        assert 0 <= i < len(ts) - 1 and 0 <= j < len(rows) - 1
    # and every scar under the band has at least one hole on its side
    for s in damage.shot_scars(p):
        sheer = profiles.sheer(p, s["t"])
        if not ts[0] < s["t"] < ts[-1]:
            continue
        if s["z"] + s["radius"] < sheer + lo or s["z"] - s["radius"] > sheer + hi:
            continue
        assert any(h[0] == s["sign"] for h in holes)


def _doc(mats):
    return {"materials": mats, "images": [{"bufferView": 0}]}


TEXTURED = {"name": "Frigate_Canvas",
            "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                     "metallicRoughnessTexture": {"index": 0}},
            "normalTexture": {"index": 0}}


def test_a_plain_tinted_material_is_not_a_texture_fault_in_the_file():
    from frigate import gltf
    plain = {"name": "Frigate_Pennant",
             "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1]}}
    doc = _doc([TEXTURED, plain])
    assert gltf.texture_faults(doc, plain=("Frigate_Pennant",)) == []
    assert gltf.texture_faults(doc) != []


def test_a_tinted_material_that_is_textured_or_not_white_is_a_fault():
    from frigate import gltf
    grey = {"name": "Frigate_Pennant",
            "pbrMetallicRoughness": {"baseColorFactor": [0.5, 0.5, 0.5, 1]}}
    textured = dict(TEXTURED, name="Frigate_Pennant")
    for bad in (grey, textured):
        assert gltf.texture_faults(_doc([TEXTURED, bad]),
                                   plain=("Frigate_Pennant",))


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_most_of_the_stripe_is_still_there(p):
    ts, rows = owner.stripe_ts(p), owner.stripe_rows(p)
    quads = 2 * (len(ts) - 1) * (len(rows) - 1)
    assert len(owner.stripe_holes(p)) < 0.2 * quads
