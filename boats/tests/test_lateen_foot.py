"""DEVIATION B: the lateen's foot and the poop's break. No bpy.

HISTORY, kept as history. Before the commit that set a ruled `LateenSpar` on
`GALLEON_RIG`, `joints.DEVIATIONS` recorded the lateen's foot dipping 0.5309 m
inside the poop's wall, and recorded a fix: "derive the clew against
`_highest_rail_between(tack, clew)` rather than against the rail at the clew's
own station", called cheap and wanting only a render first.

That fix WAS A NO-OP, and this file was the arithmetic that proved it. The cap
rises MONOTONICALLY from the tack's station to the clew's, so its maximum over
the foot's span IS its value at the clew, and the proposed derivation returned
the number the clew already had. That lesson still holds and is pinned below.

What the record got wrong was WHICH quantity is the worst along the span. A
lateen's foot is not level: it RAKES. What defeated it was not a sweep but a
STEP — the poop breaks at t 0.8100, and the cap jumps 1.6007 m from
t 0.80995 to t 0.81005, which is 0.0034 m of y — and a straight chord cannot
step. On the default spar (heel (0, -7.5875, 7.3823), clew
(0, -15.3542, 12.3720)) the foot stood 0.6000 m inside the poop's cap at the
break, and no clew height could lift it: the heel is the tack and could not
move.

THE FIX MOVED THE HEEL. A read-only sweep of 14,014 spars ruled a shorter,
flatter yard (0.82 of the span, slings 0.54 up the mast, 44 deg): the heel
rose 2.9571 m and the foot chord now clears the poop's cap at the break by
1.2244 m and the rail cap at the clew by 1.2000 m. The tests that pinned the
defect are now its inverse. `tests/test_lateen_clears_the_poop.py` holds the
invariants.
"""

import math

import pytest

from frigate import profiles, sailplan
from frigate.sailplan import (LATEEN_CLEW_CLEAR, _highest_rail_between,
                              _lateen_corners, _rail_z)
from frigate.params import FrigateParams, GalleonParams

F = FrigateParams()
G = GalleonParams()
C = _lateen_corners(G, "mizzen")
TACK, CLEW, PEAK = C.tack, C.clew, C.peak


def _cap(y: float) -> float:
    return profiles.rail_top_z(G, profiles.t_of_y(G, y))


def _foot_z(y: float) -> float:
    """The foot chord's height at station `y`, tack to clew."""
    s = (TACK[1] - y) / (TACK[1] - CLEW[1])
    return TACK[2] + (CLEW[2] - TACK[2]) * s


# --- the corners this is all measured against, both ends of each named -------


def test_the_three_corners_are_where_the_ruled_spar_puts_them():
    """Re-pinned to the ruled spar. Before it: tack (0, -7.5875, 7.3823),
    clew (0, -15.3542, 12.3720), peak (0, -17.5449, 20.1271)."""
    assert TACK == pytest.approx((0.0, -9.3393, 12.2018), abs=1e-4)
    assert CLEW == pytest.approx((0.0, -19.4311, 12.5064), abs=1e-4)
    assert PEAK == pytest.approx((0.0, -22.2776, 24.6962), abs=1e-4)


# --- THE REFUTATION, still true --------------------------------------------


def test_the_rail_cap_rises_monotonically_from_the_tack_to_the_clew():
    """Which is why there is no worse SWEPT point along the span than the end.

    Both ends named: cap 7.8408 at the tack's station t 0.7256, cap 11.2242 at
    the clew's t 0.9559, and every sample between them no lower than the last.
    (Before the ruled spar: 7.8315 at t 0.7232 to 11.1720 at t 0.9516.)
    """
    caps = [_cap(TACK[1] + (CLEW[1] - TACK[1]) * i / 128.0) for i in range(129)]
    assert profiles.t_of_y(G, TACK[1]) == pytest.approx(0.7224, abs=1e-4)
    assert profiles.t_of_y(G, CLEW[1]) == pytest.approx(0.9626, abs=1e-4)
    assert caps[0] == pytest.approx(7.8284, abs=1e-4)
    assert caps[-1] == pytest.approx(11.3064, abs=1e-4)
    assert all(b >= a - 1e-9 for a, b in zip(caps, caps[1:]))


def test_the_recorded_fix_moves_the_clew_by_nothing_at_all():
    """THE REFUTATION. The highest cap between tack and clew IS the cap at the
    clew, so deriving the clew against the one or the other gives one answer.
    """
    highest = max(_cap(TACK[1] + (CLEW[1] - TACK[1]) * i / 128.0)
                  for i in range(129))
    at_the_clew = _cap(CLEW[1])
    assert highest == pytest.approx(at_the_clew, abs=1e-9)
    assert highest + LATEEN_CLEW_CLEAR == pytest.approx(CLEW[2], abs=1e-9)


def test_the_poop_break_is_a_STEP_and_the_foot_now_clears_it():
    """THE POOP BREAK, the SAME 1.6000 m step DEFECT 2 was about, and still
    there: at t 0.8100, y -10.5400, the cap goes from the quarterdeck's 8.2791
    to the poop's 9.8791 with no run between them.

    Before the ruled spar the worst point along the foot was the break
    itself, 0.6000 m INSIDE the poop's cap (the ledger's earlier 0.5309 at
    y -10.694 was a 41-sample artefact). Now the foot chord stands at 11.1035
    there: 1.2244 m over the POOP's cap and 2.8245 m over the quarterdeck's,
    and the worst point along the whole foot is the CLEW, at exactly
    `LATEEN_CLEW_CLEAR` 1.2000 over the cap at its own station.
    """
    before = profiles.rail_top_z(G, 0.80999)
    after = profiles.rail_top_z(G, 0.81001)
    assert before == pytest.approx(8.2791, abs=1e-3)
    assert after == pytest.approx(9.8791, abs=1e-3)
    assert after - before == pytest.approx(1.6000, abs=1e-3)
    dy = abs(profiles.station_y(G, 0.81001) - profiles.station_y(G, 0.80999))
    assert dy < 0.01
    assert profiles.station_y(G, 0.81) == pytest.approx(-13.0200, abs=1e-3)
    # the foot over the POOP's cap and over the QUARTERDECK's, at the break
    assert _foot_z(-10.5400) == pytest.approx(12.2380, abs=1e-3)
    assert _foot_z(-10.5400) - after == pytest.approx(2.3589, abs=1e-3)
    assert _foot_z(-10.5400) - before == pytest.approx(3.9590, abs=1e-3)
    # the worst clearance along the whole foot is at the CLEW, not the break
    worst = min(((_foot_z(y) - _cap(y)), y)
                for y in (TACK[1] + (CLEW[1] - TACK[1]) * i / 20000.0
                          for i in range(20001)))
    assert worst[0] == pytest.approx(LATEEN_CLEW_CLEAR, abs=1e-4)
    assert worst[1] == pytest.approx(CLEW[1], abs=1e-3)


def test_the_clew_as_derived_already_lifts_the_foot_over_the_break():
    """THE INVERSE of "no clew height can lift the foot". Then, the heel was
    pinned so low that clearing the break by `LATEEN_CLEW_CLEAR` wanted the
    clew at 17.1068, 0.2169 m under the yard: a sail 0.22 m wide.

    Now the heel stands high enough that the clew the ordinary derivation
    gives (rail cap at its own station + 1.20 = 12.4242) is already ABOVE the
    clew height the break would demand, so nothing has to be lifted, and that
    height is far under the yard at the clew's station. Both ends named.
    """
    y_break = profiles.station_y(G, 0.8100)
    s = (TACK[1] - y_break) / (TACK[1] - CLEW[1])
    needed = TACK[2] + (_cap(y_break) + LATEEN_CLEW_CLEAR - TACK[2]) / s
    assert needed < CLEW[2]
    yard_slope = (PEAK[2] - TACK[2]) / (TACK[1] - PEAK[1])
    yard_z = TACK[2] + yard_slope * (TACK[1] - CLEW[1])
    assert yard_z - CLEW[2] > 5.0


def test_the_sail_is_a_real_triangle():
    """Foot 8.1055 and leech 7.9268 against a head of 13.9602: 2.0722 m of
    slack (was 1.1166 on foot 9.2314 + leech 8.0585 - head 16.1734)."""
    foot = math.dist(TACK, CLEW)
    leech = math.dist(PEAK, CLEW)
    head = math.dist(TACK, PEAK)
    assert foot == pytest.approx(10.0965, abs=1e-3)
    assert leech == pytest.approx(12.5177, abs=1e-3)
    assert head == pytest.approx(17.9864, abs=1e-3)
    assert foot + leech - head == pytest.approx(4.6278, abs=1e-3)


# --- DEFECT 10: the gaff and staysail reader is blind to the castles ---------


def test_the_rail_reader_the_boom_and_the_staysail_use_sees_a_castle():
    """`_rail_z` was `sheer(p, t) + p.bulwark_h` — the WAIST cap, which is the
    only rail a frigate has. It is the same defect `profiles.rail_top_z` had
    before the poop was found: over the galleon's poop it answered the waist
    cap and was 3.34 m low.

    LATENT, not live: no built ship sets a gaff or a staysail. The frigate is
    all square and the galleon is square plus one lateen, so neither
    `_gaff_corners` nor `_staysail_corners` runs on either. The SCHOONER is
    all gaff, and it would have hung both booms on the waist cap.

    Both ends named, at the clew's own station t 0.9559: the waist cap stands
    7.1242 above the waterline and the poop's cap 11.2242, 4.1000 m higher.
    At the TACK's own station t 0.7256 it is 5.3408 against 7.8408. (The
    waist figures were 7.6742 and 5.8908 until the lower battery left the
    bulwark, the maintainer's ruling 2026-10-05, R4, and the waist cap dropped
    0.55 m; on the spar before the ruled one: t 0.9516, 7.6220 / 11.1720.)
    """
    t = profiles.t_of_y(G, CLEW[1])
    assert profiles.sheer(G, t) + G.bulwark_h == pytest.approx(
        7.2064, abs=1e-3)   # 42 m hull
    assert profiles.rail_top_z(G, t) == pytest.approx(11.3064, abs=1e-3)
    assert _rail_z(G, t) == pytest.approx(profiles.rail_top_z(G, t), abs=1e-9)


def test_the_fix_is_inert_because_no_BUILT_ship_reaches_the_reader():
    """AND THAT IS THE ONLY REASON, which is worth stating because the first
    draft of this test asserted the wrong one.

    "On a flush-decked hull `rail_top_z` IS the waist cap" is FALSE of the
    frigate: she carries a forecastle at rise 1.00 and a quarterdeck at 1.20,
    so the two readers differ at every one of 201 stations of her length —
    +0.4000 m forward and +0.6000 m aft. Changing `_rail_z` WOULD move her, if
    anything on her reached it.

    Nothing does. `_rail_z` is reached only from `_gaff_corners` and
    `_staysail_corners`, and neither ship sets either sail: both rigs declare
    `headsails = ()`, the frigate's nine sails are all SQUARE and the
    galleon's six are five SQUARE and one LATEEN.
    """
    import frigate.shiptype as st

    differ = sum(1 for i in range(201)
                 if abs(profiles.rail_top_z(F, i / 200.0)
                        - (profiles.sheer(F, i / 200.0) + F.bulwark_h)) > 1e-9)
    assert differ == 201
    assert profiles.rail_top_z(F, 0.0) - (profiles.sheer(F, 0.0)
                                          + F.bulwark_h) == pytest.approx(0.40)
    assert profiles.rail_top_z(F, 1.0) - (profiles.sheer(F, 1.0)
                                          + F.bulwark_h) == pytest.approx(0.60)

    for p in (F, G):
        assert p.rig.headsails == ()
        kinds = {sail.kind for _mast, sail in sailplan.all_sails(p)}
        assert st.SailKind.GAFF not in kinds
        assert st.SailKind.STAYSAIL not in kinds
    # and the schooner, which is all gaff, is the ship this was waiting to bite
    assert {s.kind for m in st.SCHOONER_RIG.masts
            for s in m.sails} == {st.SailKind.GAFF}


def test_the_boom_reader_now_answers_with_the_rail_that_is_really_there():
    """`_highest_rail_between` over the lateen's own span answered the
    waist cap (7.6220 under the clew of that day's spar) — where the highest
    rail anywhere under that span is the poop's, 3.55 m higher: 11.2242 at
    the clew's t 0.9559 on the ruled spar (11.1720 at t 0.9516 before it)."""
    assert _highest_rail_between(G, TACK[1], CLEW[1]) == pytest.approx(
        11.3064, abs=1e-3)   # 42 m hull
