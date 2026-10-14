"""The galleon's stern — the defining feature of the type. No bpy here.

BOTH ENDPOINTS OF EVERY MEASUREMENT ARE NAMED. The landmarks this file is
written against, all at STATION 1.0, the taffrail:

    STERN SHEER          z = 5.80 m above the waterline (frigate 3.60)
    WAIST RAIL CAP       z = 8.25 m                     (frigate 5.20)
    QUARTERDECK RAIL CAP z = 10.20 m                    (frigate has none)
    POOP RAIL CAP        z = 11.80 m                    (frigate has none)

11.80 m is 34.7% of the galleon's own 34.00 m length. The frigate's topmost
rail at her own taffrail is her waist bulwark cap at 5.20 m, 13.7% of her own
38.00 m. That ratio, and nothing about length over beam, is the galleon.

REFERENCE. The same two the hull was measured against: the Galeon Andalucia
(2010 replica, hull 38 m, beam 10.12 m, draft 3.40 m) and Vasa (1628, 47.5 m
between perpendiculars, 11.7 m beam, two gun decks, lateen mizzen). Both
carry TWO tiers of stern lights with quarter galleries at each, which is what
this stern builds and what a flush-decked frigate has no transom to carry.
"""

import pytest

from frigate import profiles
from frigate import shiptype as st
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


# --- the transom is a FLIGHT of panels, not one -----------------------------

def test_the_frigates_transom_is_one_panel_and_the_galleons_is_three():
    assert len(profiles.transom_tiers(F)) == 1
    assert len(profiles.transom_tiers(G)) == 3


def test_the_frigates_one_panel_is_exactly_what_it_always_was():
    """STERN SHEER to WAIST RAIL CAP, which is all a flush-decked ship has."""
    sz = profiles.sheer(F, 1.0)
    assert profiles.transom_tiers(F) == [(sz, sz + F.bulwark_h)]
    assert profiles.taffrail_z(F) == pytest.approx(5.20, abs=1e-9)


def test_the_galleons_three_panels_stack_without_a_gap_or_an_overlap():
    """Every panel's foot is what its wall is STEPPED ON, so they meet.

    A poop over a quarterdeck is stepped on the QUARTERDECK's rail cap, not
    on the waist rail two decks below it, and `castle_foot_z` is what knows
    that. Panels derived from each castle's own deck instead would have
    overlapped by a whole quarterdeck.

    WATERLINE to each panel's foot and head at the taffrail. Panel 0 runs
    STERN SHEER 5.80 to WAIST RAIL CAP 7.70 and panel 1 from there to the
    QUARTERDECK RAIL CAP 10.20. They met at 8.25 until the lower battery
    left the bulwark (the maintainer's ruling 2026-10-05, R4) and the waist cap
    dropped 0.55 m; they still meet.
    """
    tiers = profiles.transom_tiers(G)
    assert tiers[0] == pytest.approx((5.80, 7.70), abs=1e-9)
    assert tiers[1] == pytest.approx((7.70, 10.20), abs=1e-9)
    assert tiers[2] == pytest.approx((10.20, 11.80), abs=1e-9)
    for (_f0, h0), (f1, _h1) in zip(tiers, tiers[1:]):
        assert h0 == pytest.approx(f1, abs=1e-12)


def test_waterline_to_poop_rail_cap_at_the_taffrail_is_the_whole_point():
    assert profiles.taffrail_z(G) == pytest.approx(11.80, abs=1e-9)
    assert profiles.taffrail_z(G) / G.loa == pytest.approx(0.281, abs=0.002)
    assert profiles.taffrail_z(F) / F.loa == pytest.approx(0.137, abs=0.002)
    # 2.05 on the 42 m hull (2.5 at 34 m): her castle stays true size
    assert (profiles.taffrail_z(G) / G.loa) / (profiles.taffrail_z(F) / F.loa) \
        > 2.0


def test_stern_sheer_to_poop_rail_cap_is_six_metres_of_transom():
    """The frigate's whole transom is 1.60 m tall. The galleon's is 6.00."""
    assert profiles.taffrail_z(G) - profiles.sheer(G, 1.0) == \
        pytest.approx(6.00, abs=1e-9)
    assert profiles.taffrail_z(F) - profiles.sheer(F, 1.0) == \
        pytest.approx(1.60, abs=1e-9)


# --- the tumblehome floor, which six metres of transom found -----------------

def test_the_topsides_may_not_tumble_past_half_their_width_at_the_sheer():
    """`bulwark_half_width` extrapolated its lean linearly and FOREVER.

    The frigate never found out: her topsides stand 1.60 m above her sheer
    and lose 9.6% doing it. A galleon's stern castle stands 6.00 m above the
    sheer, so the same line took the transom in by 60% — TRANSOM-WIDTH-AT-
    THE-TAFFRAIL 1.99 m against TRANSOM-WIDTH-AT-THE-STERN-SHEER 4.98 m —
    and at `bulwark_tumble` 0.10 the side reaches the centreline 10 m up and
    comes out the other side.
    """
    sz = profiles.sheer(G, 1.0)
    at_sheer = 2.0 * profiles.stern_half_width(G, sz)
    at_taffrail = 2.0 * profiles.stern_half_width(G, profiles.taffrail_z(G))
    assert at_sheer == pytest.approx(6.153, abs=0.01)
    assert at_taffrail == pytest.approx(3.199, abs=0.01)
    assert at_taffrail / at_sheer == pytest.approx(G.hull_form.tumble_floor,
                                                   abs=0.005)
    # Vasa's taffrail is about 0.21 of her own 11.7 m beam.
    assert at_taffrail / G.beam == pytest.approx(0.235, abs=0.005)


def test_the_floor_binds_only_on_the_top_of_the_poop_and_nowhere_lower():
    """Everything the hull pass measured and checked is untouched by it.

    The floor bites `bulwark_tumble * above > 1 - tumble_floor`, which on
    this galleon is 4.80 m above the stern sheer. The waist rail cap is
    2.45 m up, both gunport rows are inside that, and the quarterdeck castle
    tops out at 4.40 m.
    """
    h = G.hull_form
    bites_above = (1.0 - h.tumble_floor) / h.bulwark_tumble
    assert bites_above == pytest.approx(4.80, abs=0.01)
    assert G.bulwark_h < bites_above
    for deck in G.gun_decks:
        assert deck.head < bites_above
    quarter = G.tier("Deck_Quarter")
    assert quarter.rise + quarter.bulwark_h < bites_above
    poop = G.tier("Deck_Poop")
    assert poop.rise + poop.bulwark_h > bites_above


def test_the_frigates_floor_is_off_and_her_topsides_do_not_move():
    assert F.hull_form.tumble_floor == 0.0
    sz = profiles.sheer(F, 1.0)
    for z in (sz, sz + 0.8, sz + F.bulwark_h):
        above = z - sz
        plain = (profiles.half_beam(F, 1.0)
                 * profiles.tumblehome(F, sz, sz)
                 * (1.0 - F.hull_form.bulwark_tumble * above))
        assert profiles.bulwark_half_width(F, 1.0, z) == pytest.approx(
            plain, abs=1e-15)


# --- two tiers of stern lights ----------------------------------------------

def test_the_frigate_has_one_band_of_lights_and_the_galleon_two():
    assert len(profiles.gallery_tiers(F)) == 1
    assert len(profiles.gallery_tiers(G)) == 2
    assert [n for _lo, _hi, n in profiles.gallery_tiers(F)] == [5]
    assert [n for _lo, _hi, n in profiles.gallery_tiers(G)] == [9, 4]


def test_the_frigates_band_is_exactly_where_it_always_was():
    lo, hi, n = profiles.gallery_tiers(F)[0]
    assert (lo, hi) == pytest.approx(profiles.gallery_band(F), abs=1e-12)
    sz = profiles.sheer(F, 1.0)
    assert sz - lo == pytest.approx(1.90, abs=1e-12)
    assert sz - hi == pytest.approx(0.35, abs=1e-12)
    assert n == 5
    rects = profiles.gallery_window_rects(F)
    assert len(rects) == 5
    assert rects[0][1] - rects[0][0] == pytest.approx(0.874, abs=0.002)
    assert rects[0][3] - rects[0][2] == pytest.approx(1.190, abs=0.002)


def test_the_great_cabins_lights_are_tall_and_narrow_and_the_coachs_square():
    """Seven below, four above, with both bands' own dimensions named.

    LOWER, the great cabin's: STERN-SHEER to BAND-FOOT 1.95 m down and to
    BAND-HEAD 0.50 m down, each light 0.541 m wide by 1.170 m tall.
    UPPER, the coach's: STERN-SHEER to BAND-FOOT 2.65 m UP and to BAND-HEAD
    3.60 m up, each light 0.549 m by 0.670 m.
    """
    sz = profiles.sheer(G, 1.0)
    lower, upper = profiles.gallery_tiers(G)
    assert sz - lower[0] == pytest.approx(1.95, abs=1e-9)
    assert sz - lower[1] == pytest.approx(0.50, abs=1e-9)
    assert upper[0] - sz == pytest.approx(2.65, abs=1e-9)
    assert upper[1] - sz == pytest.approx(3.60, abs=1e-9)

    low = profiles.gallery_window_rects(G, 0)
    up = profiles.gallery_window_rects(G, 1)
    assert len(low) == 9 and len(up) == 4   # 7 low lights at 34 m
    assert low[0][1] - low[0][0] == pytest.approx(0.531, abs=0.003)
    assert low[0][3] - low[0][2] == pytest.approx(1.170, abs=0.003)
    assert up[0][1] - up[0][0] == pytest.approx(0.737, abs=0.003)
    assert up[0][3] - up[0][2] == pytest.approx(0.670, abs=0.003)
    # Tall and narrow below, nearly square above.
    assert (low[0][3] - low[0][2]) / (low[0][1] - low[0][0]) > 2.0
    assert (up[0][3] - up[0][2]) / (up[0][1] - up[0][0]) < 1.4


def test_every_band_of_lights_stands_inside_the_structure_it_is_cut_in():
    """A band above the sheer must fit a TRANSOM PANEL; one below it the hull.

    The coach's lights are cut in the quarterdeck castle's own transom, so
    they are bound by that panel at both ends. 8.45 m to 9.40 m inside a
    panel running 8.25 m to 10.20 m.
    """
    sz = profiles.sheer(G, 1.0)
    panels = profiles.transom_tiers(G)
    for lo, hi, _n in profiles.gallery_tiers(G):
        if hi <= sz:
            continue
        assert any(foot <= lo and hi <= head for foot, head in panels)


def test_every_light_stays_inside_the_transom_it_is_cut_in():
    for p in (F, G):
        for tier, (x0, x1, z0, z1) in profiles.all_gallery_window_rects(p):
            for x in (x0, x1):
                for z in (z0, z1):
                    assert abs(x) < profiles.stern_half_width(p, z)


# --- the quarter badges -----------------------------------------------------

def test_the_galleon_carries_a_quarter_badge_at_EVERY_tier():
    """Two a side, which is what a two-storey quarter gallery is.

    The frigate has one a side because she has one band of lights.
    """
    assert len(profiles.gallery_tiers(G)) == 2
    assert len(profiles.gallery_tiers(F)) == 1


def test_the_coachs_badge_clears_the_castle_wall_it_hangs_on():
    """BADGE-HOOD-TOP to CASTLE-WALL-HEAD at the badge's OWN station.

    The badge stands at station 0.968, not at the transom, and the
    quarterdeck castle's wall head FOLLOWS THE SHEER: it is 10.20 m at the
    taffrail and 9.77 m at 0.968, because the sheer has already fallen 0.42 m
    by there. A band chosen off the transom alone put the ogee hood 0.05 m
    THROUGH the castle it hangs on.
    """
    sf = G.stern_form
    wall = profiles.castle_wall_zs(G, G.tier("Deck_Quarter"), sf.badge_t)
    _lo, hi, _n = profiles.gallery_tiers(G)[1]
    lo = profiles.gallery_tiers(G)[1][0]
    assert wall[0] < lo
    assert hi + sf.badge_hood < wall[2]
    assert wall[2] - (hi + sf.badge_hood) == pytest.approx(0.19, abs=0.03)


def test_the_badge_measures_itself_against_the_skin_it_stands_against():
    """`skin_half_width` is hull below the sheer and BULWARK above it.

    The coach's badge stands against a castle wall 2.65 m over the stern
    sheer, where `hull_half_width` clamps and reports the hull's width at the
    sheer — 0.72 m too wide. The two agree exactly at and below the sheer, so
    the frigate's one badge is measured as it always was.
    """
    # At and below the sheer AT THAT STATION, which is 5.38 m and not the
    # 5.80 m at the taffrail: the sheer has fallen 0.42 m by station 0.968.
    local = profiles.sheer(G, 0.968)
    for z in (local - 1.0, local):
        assert profiles.skin_half_width(G, 0.968, z) == pytest.approx(
            profiles.hull_half_width(G, 0.968, z), abs=1e-15)
    hi = profiles.gallery_tiers(G)[1][1]
    assert profiles.skin_half_width(G, 0.968, hi) \
        < profiles.hull_half_width(G, 0.968, hi) - 0.5


# --- what the stern form refuses --------------------------------------------

@pytest.mark.parametrize("kwargs, match", [
    (dict(gallery_drop=0.2, gallery_head=0.5), "must stand above its FOOT"),
    (dict(gallery_margin=0.0), "gallery_margin"),
    (dict(badge_facets=2), "three facets"),
    (dict(badge_lights=9), "do not fit"),
    (dict(badge_mould=0.9), "badge_mould"),
    (dict(upper_galleries=(st.GalleryTier("a", 1.0, 0.5, 3),)), "must stand up"),
    (dict(upper_galleries=(st.GalleryTier("a", 1.0, 2.0, 0),)), "at least one light"),
    (dict(upper_galleries=(st.GalleryTier("a", 1.0, 2.0, 3),
                           st.GalleryTier("b", 1.5, 2.5, 3))), "overlap"),
])
def test_a_stern_form_that_could_not_be_built_is_refused(kwargs, match):
    with pytest.raises(ValueError, match=match):
        st.SternForm(**kwargs).validate()


def test_the_frigates_stern_form_is_the_constants_it_replaced():
    sf = F.stern_form
    assert (sf.gallery_drop, sf.gallery_head, sf.gallery_margin,
            sf.gallery_depth) == (1.90, 0.35, 0.25, 0.30)
    assert (sf.window_mullion, sf.window_inset_z, sf.window_recess,
            sf.dentil_drop) == (0.14, 0.18, 0.22, 0.26)
    assert (sf.badge_t, sf.badge_facets, sf.badge_bulge, sf.badge_mould,
            sf.badge_lights, sf.badge_hood) == (0.975, 6, 0.42, 0.07, 3, 0.18)
    assert (sf.carving_proud, sf.carving_dentils, sf.carving_panels,
            sf.name_board_bosses) == (0.14, 23, 7, 9)
    assert (sf.modillions, sf.dentils) == (13, 15)
    assert sf.upper_galleries == ()
    # 1.0 exactly: a multiply by it is exact in IEEE, which is how the
    # frigate's carving survives the layout becoming a parameter.
    assert sf.carving_edge == 1.0
