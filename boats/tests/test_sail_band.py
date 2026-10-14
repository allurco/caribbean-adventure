"""The owner's SAIL BAND across the main course. No bpy.

The maintainer's ruling (issue #134, revised): the player's colour goes on the
pennant, the hull stripe and a band across the main course, the largest sail;
the rest of the canvas stays plain, and the flag flies the captain's nation.
The band is its OWN mesh with its OWN plain white material, as the pennant and
the stripe are, so the game tints it alone after merging the file by material.

It is two sheets, one off each face of the canvas, so it reads from either
side, and each sheet faces away from the cloth. To leeward it is PAINT: it lies
under the sail patches and the buntlines that run down that face.
"""

import math

import pytest

from frigate import board, budget, damage, owner, palette, profiles, sailplan, wind
from frigate.params import (FluteParams, FrigateParams, GalleonParams,
                            SloopParams)
from frigate.shiptype import SailKind

F, G, L, S = FrigateParams(), GalleonParams(), FluteParams(), SloopParams()
SHIPS = [F, G, L, S]
IDS = ["frigate", "galleon", "flute", "sloop"]


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def test_the_band_is_named_for_the_catalogue_and_tinted():
    assert owner.SAIL_BAND == "Sail_Band"
    assert owner.TINTED_PARTS == ("Pennant", "Hull_Stripe", "Sail_Band")
    assert palette.is_tinted("Sail_Band")
    with pytest.raises(KeyError):
        palette.family_of("Sail_Band")


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_band_wears_a_white_material_of_its_own_named_for_her(p):
    names = palette.tinted_material_names(p)
    assert names["Sail_Band"] == f"{p.collection}_SailBand"
    assert len(set(names.values())) == len(names)
    assert not set(names.values()) & set(palette.material_names(p).values())


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_band_spends_her_sails_line(p):
    assert budget.component_of(p, "Sail_Band") == "sails"


def test_the_board_variant_names_the_band_and_never_thins_it():
    assert "Sail_Band" in board.NAMED_PARTS
    assert "Sail_Band" in board.WHOLE


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_band_crosses_the_lowest_sail_on_her_mainmast(p):
    mast, sail = owner.band_sail(p)
    assert mast == "main"
    assert sail.tier == min(s.tier for s in p.rig.mast("main").sails)
    # the main course is her largest sail
    assert (mast, sail) in sailplan.all_sails(p)


def test_a_square_rigger_bands_her_main_course_and_the_sloop_her_mainsail():
    for p in (F, G, L):
        assert owner.band_sail(p)[1].kind is SailKind.SQUARE
    assert owner.band_sail(S)[1].kind is SailKind.GAFF


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_band_runs_leech_to_leech_on_the_sail_grid_rows(p):
    """Its nodes stand over the canvas's own grid nodes, so the band is a
    parallel surface to the cloth and never chords through it."""
    mast, sail = owner.band_sail(p)
    nu, nv = profiles.SAIL_NU, profiles.SAIL_NV
    cloth = sailplan.sail_grid(p, mast, sail, nu, nv)
    lo, hi = owner.BAND_ROWS
    for side in (-1.0, 1.0):
        grid = owner.band_grid(p, side)
        assert len(grid) == hi - lo + 1
        for r, row in enumerate(grid):
            assert len(row) == nu
            for i, pt in enumerate(row):
                gap = math.dist(pt, cloth[lo + r][i])
                assert gap == pytest.approx(owner.band_lift(side), abs=1e-9)


def test_the_band_is_a_sixth_of_the_sail_across_its_middle():
    lo, hi = owner.BAND_ROWS
    nv = profiles.SAIL_NV
    assert (hi - lo) / (nv - 1) == pytest.approx(1 / 6)
    assert 0.3 < lo / (nv - 1) < hi / (nv - 1) < 0.7


def test_to_leeward_the_band_is_paint_under_the_patches_and_buntlines():
    from frigate import ropes
    lee = owner.band_lift(1.0)
    assert 0.01 <= lee <= wind.PATCH_LIFT - 0.01
    assert lee < ropes.BUNTLINE_LIFT
    # to windward nothing lies on the cloth, so it stands further off
    assert owner.band_lift(-1.0) > lee


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_each_sheet_faces_away_from_the_cloth(p):
    verts, faces = owner.band_mesh(p)
    mast, sail = owner.band_sail(p)
    nu, nv = profiles.SAIL_NU, profiles.SAIL_NV
    cloth = sailplan.sail_grid(p, mast, sail, nu, nv)
    flat = [pt for row in cloth for pt in row]
    for face in faces:
        a, b, c, d = (verts[k] for k in face)
        n = _cross(_sub(b, a), _sub(d, a))
        centre = tuple(sum(x) / 4 for x in zip(a, b, c, d))
        nearest = min(flat, key=lambda q: math.dist(q, centre))
        assert _dot(n, _sub(centre, nearest)) > 0.0


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_the_band_draws_two_sheets_less_the_torn_quads(p):
    verts, faces = owner.band_mesh(p)
    lo, hi = owner.BAND_ROWS
    quads = (profiles.SAIL_NU - 1) * (hi - lo)
    holes = owner.band_holes(p)
    assert len(faces) == 2 * (quads - len(holes))
    assert len(verts) == 2 * profiles.SAIL_NU * (hi - lo + 1)


@pytest.mark.parametrize("p", SHIPS, ids=IDS)
def test_a_tear_in_the_canvas_tears_the_band_too(p):
    """Paint does not bridge a hole: a torn quad under the band is left out."""
    mast, sail = owner.band_sail(p)
    lo, hi = owner.BAND_ROWS
    want = set()
    if p.builds("damage"):
        for m, tier, i, j in damage.canvas_tears(p, profiles.SAIL_NU,
                                                 profiles.SAIL_NV):
            if m == mast and tier == sail.tier and lo <= j < hi:
                want.add((i, j))
    assert owner.band_holes(p) == want
