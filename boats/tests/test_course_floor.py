"""Where a COURSE's foot is floored: the rule lives on the ship's own rig.

A course (tier 0) is sheeted over the rail, so its foot stops
`COURSE_RAIL_CLEAR` (1.00 m) above a rail. WHICH rail is the per-ship ruling
`RigPlan.course_floor`, and every figure below spans the FOOT of the course to
a rail height at the course's OWN mast station:

- WAIST_CAP (the default, the frigate verbatim): foot >= sheer + bulwark_h
  + 1.00, the waist bulwark's cap. On the frigate that floor is what has
  always shaped her courses and it may not move a bit.
- RAIL_TOP (the galleon, ruled by the maintainer 2026-10-05): foot >=
  `profiles.rail_top_z(p, t)` + 1.00, the rail actually standing there — on a
  castle ship the forecastle's own wall head, which stands higher than the
  waist cap. Under WAIST_CAP her fore course foot stood 1.3000 m short of
  that (6.9342 against 8.2342) and her main 0.3000 m short (6.5506 against
  6.8506).
"""

from dataclasses import replace

import pytest

from frigate import profiles, shiptype, wind
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()


@pytest.mark.parametrize("mast", ["fore", "main"])
def test_the_galleons_course_foot_clears_the_rail_actually_there(mast):
    t = profiles.mast_t(G, mast)
    foot = wind.sail_panel(G, mast, 0)["foot_z"]
    floor = profiles.rail_top_z(G, t) + wind.COURSE_RAIL_CLEAR
    assert foot >= floor - 1e-9, (
        f"galleon {mast} course foot z {foot:.4f} stands {floor - foot:.4f} m "
        f"below rail_top_z + COURSE_RAIL_CLEAR = {floor:.4f} at its own "
        f"station t {t:.4f}")


# Course FOOT z at each mast's own station, measured before the rule moved
# onto the rig. The frigate's must not change.
FRIGATE_COURSE_FEET = {"fore": 6.5375, "main": 6.5025, "mizzen": 5.6262}


@pytest.mark.parametrize("mast", sorted(FRIGATE_COURSE_FEET))
def test_the_frigates_course_feet_do_not_move(mast):
    foot = wind.sail_panel(F, mast, 0)["foot_z"]
    assert foot == pytest.approx(FRIGATE_COURSE_FEET[mast], abs=5e-5)


def test_the_rigs_state_their_course_floor():
    assert shiptype.RigPlan(masts=shiptype.FRIGATE_RIG.masts).course_floor \
        is shiptype.CourseFloor.WAIST_CAP
    assert shiptype.FRIGATE_RIG.course_floor is shiptype.CourseFloor.WAIST_CAP
    assert shiptype.GALLEON_RIG.course_floor is shiptype.CourseFloor.RAIL_TOP


def test_an_unknown_course_floor_raises_rather_than_falling_back():
    bogus = replace(G, rig=replace(G.rig, course_floor="rail_top"))
    with pytest.raises(ValueError, match="course_floor"):
        wind.course_rail_z(bogus, "fore")


# --- the check that JUDGES a course: `checks.check_sails` reads
# `wind.course_foul_z`, and that must be the ship's own rule, not a copy of it.

COURSE_MASTS = [(F, "frigate", m) for m in ("fore", "main", "mizzen")] + \
               [(G, "galleon", m) for m in ("fore", "main")]


def test_a_course_foot_inside_the_forecastle_wall_is_reported_foul():
    # Deviation A, rebuilt: floor the galleon's fore course on the WAIST cap
    # and its FOOT comes out at z 6.3842, 0.8500 m below her forecastle wall
    # head 7.2342 at the fore mast's own station t 0.200. Judged by the
    # galleon's OWN rule (RAIL_TOP) that foot fouls the rail. (It was z
    # 6.9342, 0.3000 m below: the waist cap dropped 0.55 m when the lower
    # battery left the bulwark, the maintainer's ruling 2026-10-05, R4.)
    on_waist = replace(G, rig=replace(
        G.rig, course_floor=shiptype.CourseFloor.WAIST_CAP))
    foot = wind.sail_panel(on_waist, "fore", 0)["foot_z"]
    assert foot == pytest.approx(6.3842, abs=5e-5)
    assert foot <= wind.course_foul_z(G, "fore"), (
        f"a course foot at z {foot:.4f}, inside the forecastle wall head "
        f"{profiles.rail_top_z(G, profiles.mast_t(G, 'fore')):.4f}, "
        "passes the "
        f"foul check (foul line {wind.course_foul_z(G, 'fore'):.4f})")


@pytest.mark.parametrize("mast", sorted(FRIGATE_COURSE_FEET))
def test_the_frigates_course_foul_line_is_her_waist_cap_bit_for_bit(mast):
    t = profiles.mast_t(F, mast)
    assert wind.course_foul_z(F, mast) == \
        profiles.sheer(F, t) + F.bulwark_h + 0.5


@pytest.mark.parametrize("p,ship,mast", COURSE_MASTS,
                         ids=[f"{s}-{m}" for _p, s, m in COURSE_MASTS])
def test_no_shipped_course_fouls_its_rail(p, ship, mast):
    assert wind.sail_panel(p, mast, 0)["foot_z"] > wind.course_foul_z(p, mast)
