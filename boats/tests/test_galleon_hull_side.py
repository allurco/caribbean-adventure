"""The galleon's hull side under the maintainer's third ruling: the chainplate drop
(A), the mizzen channel on the quarterdeck castle (B) and the wales between
the port rows (C). No bpy anywhere here.

R11: every figure here is DERIVED and the data is pinned to the derivation,
so the maintainer's round numbers are checked, not typed. Both endpoints of every
measurement are named.
"""

import dataclasses

import pytest

from frigate import profiles, ropes
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


# --- B: the mizzen channel on the quarterdeck castle's side -----------------

def test_only_the_galleons_mizzen_channel_hangs_on_a_castle_wall():
    """The maintainer (B): galleon mizzen channels sat high on the aft castles. The
    frigate's three stay on her bulwark, verbatim."""
    assert F.rail_form.castle_channels == ()
    assert [profiles.channel_host(F, m) for m in profiles.mast_names(F)] \
        == [None, None, None]
    assert profiles.channel_host(G, "fore") is None
    assert profiles.channel_host(G, "main") is None
    assert profiles.channel_host(G, "mizzen").name == "Deck_Quarter"


def test_the_mizzen_channel_sits_under_the_quarterdeck_castles_own_cap():
    """The castle wall's ledge rule is the bulwark's: CHANNEL TOP
    `channel_drop` 0.12 under the RAIL CAP of the wall it is bolted to.
    The quarterdeck castle's cap is QUARTERDECK EDGE (sheer + 3.40) plus
    its own bulwark 1.00, so SHEER to MIZZEN CHANNEL TOP is 4.28 at every
    station of the channel, where the fore and main stay at WAIST CAP 1.90
    less 0.12 = 1.78. QUARTERDECK EDGE to CHANNEL UNDERSIDE (0.20 plate)
    is 0.68: the channel is bolted to the castle wall above that deck."""
    q = G.tier("Deck_Quarter")
    t0, t1 = profiles.channel_span(G, "mizzen")
    for i in range(9):
        t = t0 + (t1 - t0) * i / 8
        s = profiles.sheer(G, t)
        top = profiles.channel_z(G, t, "mizzen")
        assert top - s == pytest.approx(4.28, abs=1e-9)
        assert profiles.channel_cap_z(G, t, "mizzen") == pytest.approx(
            profiles.castle_wall_zs(G, q, t)[-1], abs=1e-12)
        under = top - G.rail_form.channel_thick
        assert under - (s + q.rise) == pytest.approx(0.68, abs=1e-9)
        assert profiles.channel_z(G, t, "main") - s == pytest.approx(
            1.78, abs=1e-9)


def test_the_mizzen_drop_is_the_largest_cm_that_clears_the_hull_row():
    """CASTLE CHANNEL EDGE to STRAP FOOT, 4.62 m, by A's rule: the largest
    drop to the cm whose in-run foot stops `strap_clear` above the hull
    row's head line and whose straps clear every hull lid's sweep by as
    much. One more centimetre and the foot between hull ports 10 and 11
    stops short of that."""
    drop = profiles.chainplate_drop_of(G, "mizzen")
    assert drop == profiles.largest_chainplate_drop(G, "mizzen") == 4.62
    assert profiles.drop_clears_hull_row(G, "mizzen")
    longer = profiles.with_chainplate_drop(G, "mizzen", drop + 0.01)
    assert not profiles.drop_clears_hull_row(longer, "mizzen")
    # The rule is NOT monotone: the mizzen passes again from 8.69 m (a foot
    # under the row altogether), so a typed 10 m upper bound PASSED and the
    # bisection was right by luck. The bound is now found by doubling until
    # it fails; the answer is the end of the first passing run, and every
    # 10 cm below it passes.
    far = profiles.with_chainplate_drop(G, "mizzen", 8.69)
    assert profiles.drop_clears_hull_row(far, "mizzen")
    for mast in profiles.mast_names(G):
        best = profiles.largest_chainplate_drop(G, mast)
        nxt = profiles.with_chainplate_drop(G, mast, best + 0.01)
        assert not profiles.drop_clears_hull_row(nxt, mast), mast
        for cm in range(1, int(round(best * 100)), 10):
            low = profiles.with_chainplate_drop(G, mast, cm / 100)
            assert profiles.drop_clears_hull_row(low, mast), (mast, cm)


def test_the_mizzen_straps_run_down_outside_the_castle_wall_to_the_hull():
    """Each strap's inner face, CHANNEL OUTER EDGE to FOOT ON THE SKIN,
    stays outboard of the side it passes (castle wall and waist bulwark
    above the sheer, hull below) at every point but the last few mm,
    where the foot is let `strap_bed` into the planking; its foot is on the
    HULL: SHEER to FOOT is -0.41 to -0.44 at the four feet (the long strap
    rakes 0.37 m aft, where the sheer climbs)."""
    r = G.rail_form
    feet = []
    for head, foot in profiles.chainplate_segments(G, "mizzen"):
        x1 = foot[0] - r.strap_bed
        t_f = profiles.t_of_y(G, foot[1])
        feet.append(foot[2] - profiles.sheer(G, t_f))
        for i in range(100):
            u = i / 100
            x = head[0] + (x1 - head[0]) * u
            y = head[1] + (foot[1] - head[1]) * u
            z = head[2] + (foot[2] - head[2]) * u
            t = profiles.t_of_y(G, y)
            side = (profiles.bulwark_half_width(G, t, z)
                    if z >= profiles.sheer(G, t)
                    else profiles.hull_half_width(G, t, z))
            assert x - side > -r.strap_bed   # the foot is let in
            if u < 0.98:                     # and only the foot
                assert x - side >= 0.0, (head, u)
    assert max(feet) == pytest.approx(-0.4114, abs=5e-4)
    assert min(feet) == pytest.approx(-0.4410, abs=5e-4)


def test_no_strap_on_any_channel_is_buried_above_its_foot():
    """CHANNEL OUTER EDGE to FOOT, each of her 15 straps (fore 5, main 6,
    mizzen 4): its inner face stays outboard of the side it passes (wall
    above the sheer, hull below) for the first 98% of its run; only the
    last few mm, the foot let `strap_bed` in, may cross. Least: 0.0098 m
    (mizzen); every strap first goes in at u 0.990-0.995."""
    r = G.rail_form
    n = 0
    least = None
    for mast in profiles.mast_names(G):
        for head, foot in profiles.chainplate_segments(G, mast):
            n += 1
            x1 = foot[0] - r.strap_bed
            for i in range(98):
                u = i / 100
                x = head[0] + (x1 - head[0]) * u
                y = head[1] + (foot[1] - head[1]) * u
                z = head[2] + (foot[2] - head[2]) * u
                t = profiles.t_of_y(G, y)
                side = (profiles.bulwark_half_width(G, t, z)
                        if z >= profiles.sheer(G, t)
                        else profiles.hull_half_width(G, t, z))
                least = x - side if least is None else min(least, x - side)
    assert n == 15
    assert least >= 0.0
    assert least == pytest.approx(0.0098, abs=5e-4)


def _wall_crossing(rope):
    """Where a shroud passes the castle side's OUTER FACE
    (`bulwark_half_width` carried up), as (t, z), by bisection."""
    (x0, y0, z0), (x1, y1, z1) = rope

    def at(u):
        y, z = y0 + (y1 - y0) * u, z0 + (z1 - z0) * u
        t = profiles.t_of_y(G, y)
        return x0 + (x1 - x0) * u - profiles.bulwark_half_width(G, t, z), t, z

    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if at(mid)[0] > 0.0:
            lo = mid
        else:
            hi = mid
    return at(lo)[1:]


def test_the_mizzen_shrouds_start_above_the_quarterdeck():
    """Before: the aftmost shroud a side left a channel on the waist
    bulwark and passed THROUGH Deck_Quarter's planking at z ~7.69. Now
    each leaves a deadeye on the castle channel, QUARTERDECK EDGE to
    DEADEYE 0.88, so no shroud is ever below that deck's edge."""
    q = G.tier("Deck_Quarter")
    for rope in ropes.lower_shrouds(G, "mizzen", 1.0):
        foot = rope[0]
        t = profiles.t_of_y(G, foot[1])
        assert foot[2] - (profiles.sheer(G, t) + q.rise) == pytest.approx(
            0.88, abs=1e-9)
        assert rope[1][2] > foot[2]


def test_the_aft_three_mizzen_shrouds_cross_the_poop_wall_KNOWN():
    """A KNOWN DEFECT this ruling cannot reach, pinned so it is seen.

    The mizzen's shrouds gather at its HOUNDS, z 9.186, which is only
    0.26-0.31 m above the POOP DECK EDGE abaft the break and 1.27-1.31 m
    under the POOP CAP. Three of the four deadeyes a side lie abaft the
    poop break (t 0.81), so their shrouds must pass the poop's side
    between its foot and its cap whatever wall the channel is on: each
    crosses the poop wall's outer face 0.29-0.33 above the QUARTERDECK
    CAP it stands on and 0.27-0.31 below the POOP DECK EDGE. The forward
    shroud crosses the side at t 0.802, forward of the poop, in the open
    over the quarterdeck. Question for the maintainer (task 9 report)."""
    poop = G.tier("Deck_Poop")
    q = G.tier("Deck_Quarter")
    assert ropes.hounds_z(G, "mizzen") == pytest.approx(9.186, abs=1e-3)
    inside = []
    for rope in ropes.lower_shrouds(G, "mizzen", 1.0):
        t, z = _wall_crossing(rope)
        s = profiles.sheer(G, t)
        if t < poop.t0:
            assert t == pytest.approx(0.802, abs=1e-3)
            continue
        inside.append((z - (s + q.rise + q.bulwark_h), s + poop.rise - z))
    assert len(inside) == 3
    over_cap = [a for a, _b in inside]
    under_deck = [b for _a, b in inside]
    assert min(over_cap) == pytest.approx(0.294, abs=2e-3)
    assert max(over_cap) == pytest.approx(0.326, abs=2e-3)
    assert min(under_deck) == pytest.approx(0.274, abs=2e-3)
    assert max(under_deck) == pytest.approx(0.306, abs=2e-3)


# --- B: what the castle channel is fastened to, and what it no longer hits --

def test_the_castle_channel_is_bolted_to_the_castle_wall_as_a_joint():
    """`Castle_Quarter x Channels`: 48 face pairs measured on the galleon,
    the mizzen channel bolted flat against the castle wall's outer face,
    seated ON it within the bite a flat plate takes out of a curved side
    (`profiles.channel_bite`, which now walks the castle channel too)."""
    from frigate import joints
    key = joints.pair("Channels", "Castle_Quarter")
    assert key in joints.JOINTS
    rules = joints.directions_for("Channels", "Castle_Quarter")
    assert [(r.mode, r.tol) for r in rules] == [(joints.ON, "channel_bite")]


def test_no_shroud_is_ruled_through_the_quarterdeck_castle_any_more():
    """`Castle_Quarter x Rigging` was a JOINT for mizzen shrouds led from
    the waist channel through the quarterdeck's wall. Blender measures 0
    pairs now, and no other ship has a Castle_Quarter: a ruling for a
    contact no ship has is removed, so a shroud through that wall FAILS."""
    from frigate import joints
    key = joints.pair("Castle_Quarter", "Rigging")
    assert key not in joints.JOINTS and key not in joints.DEVIATIONS


def test_the_aft_mizzen_shrouds_through_the_poop_side_are_capped():
    """A KNOWN DEFECT (see the KNOWN test above): the aft three mizzen
    shrouds a side cross the poop's walls because the hounds stand at
    9.186, below the poop cap. Measured in Blender as CROSSING POINTS
    (ray casts along each hit ribbon into the host, fix round 1; the
    first figures quoted the ribbons' face centres, not the crossings):
    Castle_Poop x Rigging 14 face pairs, crossing at x +/-0.57 to 1.86,
    y -12.12 to -10.54, z 8.73 to 9.15 -- the shroud to the y -12.10
    deadeye through the poop's forward bulkhead and side, the two abaft
    it through the side at x +/-1.57 to 1.84. Capped there, a question
    for the maintainer, never a joint."""
    from frigate import joints
    key = joints.pair("Castle_Poop", "Rigging")
    assert key not in joints.JOINTS
    got, why = joints.DEVIATIONS[key]
    assert got == 14
    for figure in ("9.186", "0.57", "1.86", "-12.12", "-10.54", "8.73",
                   "9.15", "1.57", "1.84", "question B' for the maintainer"):
        assert figure in why, figure
    assert joints.verdict("Castle_Poop", "Rigging", 14).ok
    assert not joints.verdict("Castle_Poop", "Rigging", 15).ok


def test_the_shrouds_through_the_poop_deck_beside_the_mast_are_a_joint():
    """CHANGED ON PURPOSE (fix round 1). Deck_Poop x Rigging was made a
    capped deviation on a misread: its 24 face pairs were quoted at the
    ribbons' face centres (x +/-1.54 to 1.58). The crossing points are
    x +/-0.36 to 1.00, y -11.24 to -10.55, z 9.02 to 9.20: the aft three
    shrouds a side leave the hounds (z 9.186, fan heads y -10.35 to
    -10.82) and go straight down through the poop deck beside the mast,
    which is the joint this pair always was (it measured x +/-0.59 at
    y -11.10, z 9.10 to 9.23 with the channel on the waist). Restored as
    that joint, re-measured; it is not a deviation."""
    from frigate import joints
    key = joints.pair("Deck_Poop", "Rigging")
    assert key not in joints.DEVIATIONS
    why = joints.JOINTS[key]
    for figure in ("0.36", "1.00", "-11.24", "-10.55", "9.02", "9.20",
                   "9.186"):
        assert figure in why, figure


# --- A: the chainplate drop, derived -----------------------------------------

def _bulwark_masts(p):
    return [m for m in profiles.mast_names(p)
            if profiles.channel_host(p, m) is None]


def test_the_drop_is_the_largest_cm_whose_feet_clear_the_hull_row():
    """The maintainer's "2.20" (A), DERIVED (R11): CHANNEL EDGE to STRAP FOOT on the
    waist bulwark's channels is the largest drop, to the cm, whose every
    foot beside the hull row stops `strap_clear` 0.04 above that row's
    PORT HEAD and whose every strap clears every hull lid's swept overhang
    by the same 0.04. The fore channel alone would take 2.21; the main
    binds at 2.20, and one more centimetre fails it."""
    largest = {m: profiles.largest_chainplate_drop(G, m)
               for m in _bulwark_masts(G)}
    assert largest == {"fore": 2.21, "main": 2.20}
    assert G.rail_form.chainplate_drop == min(largest.values()) == 2.20
    longer = profiles.with_chainplate_drop(G, "main", 2.21)
    assert not profiles.drop_clears_hull_row(longer, "main")


def test_every_foot_beside_the_hull_row_stops_above_its_port_head():
    """STRAP FOOT to the HULL ROW'S PORT HEAD LINE at the foot's own
    station, least of its two corners (Deck_Lower edge + 0.83 + 0.70,
    0.47 under the sheer), every strap on every channel whose foot lies
    between the row's first and last ports: 0.0442 to 0.0599 m ABOVE it,
    never less than `strap_clear` 0.04. It was 0.13-0.20 m BELOW it at
    the 2.40 drop."""
    clear = G.rail_form.strap_clear
    over = [o for m in profiles.mast_names(G)
            for o in profiles.strap_foot_over_head(G, m) if o is not None]
    # fore 4 (its first foot is forward of hull port 1), main 6, mizzen 1
    # (its other three are abaft hull port 11)
    assert len(over) == 11
    assert min(over) >= clear
    assert min(over) == pytest.approx(0.0442, abs=5e-4)
    assert max(over) == pytest.approx(0.0599, abs=5e-4)


def test_every_strap_clears_every_hull_lids_sweep_by_strap_clear():
    """STRAP to HULL LID'S SWEPT OVERHANG (shut through open), least of
    all: 0.0457 m, the main channel's third strap beside hull port 6,
    whose lid (1.02 m on a 0.86 m port, 0.08 overhang) used to cross it by
    0.040 m. Every strap on every channel is at least `strap_clear` 0.04
    from every hull lid."""
    gaps = [g for m in profiles.mast_names(G)
            for g in profiles.strap_lid_clearance(G, m)]
    assert min(gaps) >= G.rail_form.strap_clear
    assert min(gaps) == pytest.approx(0.0457, abs=5e-4)


def test_at_the_old_drop_the_sweep_finds_the_lid_crossing_its_strap():
    """The lid half of A's rule, tied to the retired Blender defect.

    At 2.20 every foot stands over the hinge line, so a hull lid's sweep
    cannot reach a strap and the 0.0457 above restates the head margin.
    At the OLD drop, 2.40, the feet hang 0.15 m under the head and the
    sweep is what decides: STRAP EDGE to LID SWEPT OVERHANG for the main
    channel's third strap (head y -0.942, beside hull port 6, fore edge
    y -1.239) is 0.0 -- the crossing Blender measured as Chainplates x
    PortLid_ 32 pairs on PortLid_12/13 and 22/23 -- against 0.0457 at
    2.20. It is the OVERHANG that crosses: the same strap at 2.40 beside
    a lid cut to the port's own 0.86 m width (no overhang) stands clear
    by 0.040, exactly the `strap_clear` its layout keeps from the port's
    edge."""
    old = profiles.with_chainplate_drop(G, "main", 2.40)
    heads = [h[1] for h, _f in profiles.chainplate_segments(old, "main")]
    assert heads[2] == pytest.approx(-0.942, abs=1e-3)
    gaps = profiles.strap_lid_clearance(old, "main")
    assert gaps[2] == 0.0
    assert min(profiles.strap_lid_clearance(G, "main")) == pytest.approx(
        0.0457, abs=5e-4)
    lid_w = profiles.LID_W
    try:
        profiles.LID_W = G.gun_decks[0].width          # no overhang
        bare = profiles.strap_lid_clearance(old, "main")[2]
    finally:
        profiles.LID_W = lid_w
    assert bare == pytest.approx(G.rail_form.strap_clear, abs=1e-6)


def test_two_main_straps_pass_the_open_waist_lids_inside_strap_clear_KNOWN():
    """A KNOWN SHORTFALL the drop cannot reach, pinned so it is seen. The
    WAIST row's lids (1.02 m on a 0.78 m port, 0.12 overhang) swing open
    0.80 m outboard of the bulwark, and the main channel's straps stand
    0.76-0.80 m out at that height: STRAP EDGE to OPEN WAIST LID'S CORNER
    is 0.0110 m (strap 4, beside waist port 6) and 0.0122 (strap 1,
    beside waist port 5), under `strap_clear` 0.04 at every drop -- the
    strap is near-vertical against a side that tumbles out below, so
    shortening it moves nothing here. No face pair (Blender), but short
    of the margin. Question for the maintainer (task 9 report)."""
    waist = profiles.strap_lid_clearance(G, "main", ("bulwark",))
    assert sorted(waist)[0] == pytest.approx(0.0110, abs=5e-4)
    assert sorted(waist)[1] == pytest.approx(0.0122, abs=5e-4)
    assert sorted(waist)[2] > G.rail_form.strap_clear
    for drop in (2.40, 2.00):
        other = profiles.with_chainplate_drop(G, "main", drop)
        assert min(profiles.strap_lid_clearance(
            other, "main", ("bulwark",))) < G.rail_form.strap_clear


def test_the_forward_mizzen_shroud_passes_over_the_quarterdeck_cap():
    """The one mizzen deadeye forward of the poop break: its shroud
    crosses the castle side's outer face at t 0.802, 0.335 m above the
    QUARTERDECK CAP, in the open over the quarterdeck. Measured in Blender:
    lowering every channel 0.30 leaves 0 Castle_Quarter x Rigging pairs
    (0.035 m left); 0.50 puts the shroud through that cap (16 pairs,
    UNRULED, FAIL)."""
    q = G.tier("Deck_Quarter")
    poop = G.tier("Deck_Poop")
    fwd = [r for r in ropes.lower_shrouds(G, "mizzen", 1.0)
           if _wall_crossing(r)[0] < poop.t0]
    assert len(fwd) == 1
    t, z = _wall_crossing(fwd[0])
    cap = profiles.sheer(G, t) + q.rise + q.bulwark_h
    assert z - cap == pytest.approx(0.335, abs=2e-3)


# --- C: the wales between the port rows --------------------------------------

def test_the_frigates_wale_is_her_one_band_verbatim():
    """Her single black wale, h -0.80 to -0.20 under the sheer, does not
    move: the band data a frigate states is the module's MAIN_WALE."""
    from frigate import palette
    assert F.livery_form.wales_between_rows is False
    assert palette.wale_bands(F) == (("main_wale", -0.80, -0.20),)
    assert palette.wale_bands(F)[0][1:] == palette.MAIN_WALE


def test_the_galleons_wales_lie_between_and_below_her_port_rows():
    """The maintainer (C): the black wales run BETWEEN the port rows. Derived from
    the row figures (R11), all SHEER-relative, as the wales follow the
    sheer:

    - HULL-ROW HEAD -0.47 to WAIST-ROW SILL +0.85 is 1.32 m of side; the
      MAIN WALE keeps the frigate's own wale depth, 0.60 (MAIN_WALE -0.80
      to -0.20), centred in it: -0.11 to +0.49, so HULL-ROW HEAD to WALE
      BOTTOM and WALE TOP to WAIST-ROW SILL are both 0.36 m, the named
      `palette.wale_clearance`.
    - The LOWER WALE, the same depth, stands that same 0.36 m under the
      HULL-ROW SILL -1.17: -2.13 to -1.53.

    Each brackets a deck line (the main deck edge at 0.00, Deck_Lower's
    edge at -2.00), which is what a wale marks."""
    from frigate import palette
    assert G.livery_form.wales_between_rows is True
    clear = palette.wale_clearance(G)
    assert clear == pytest.approx(0.36, abs=1e-9)
    (m, m_lo, m_hi), (lw, l_lo, l_hi) = palette.wale_bands(G)
    assert (m, lw) == ("main_wale", "lower_wale")
    hull, waist = G.gun_decks
    head = G.tier(hull.served_by).rise + hull.head
    sill = G.tier(hull.served_by).rise + hull.sill
    w_sill = G.tier(waist.served_by).rise + waist.sill
    assert m_lo - head == pytest.approx(clear, abs=1e-9)
    assert w_sill - m_hi == pytest.approx(clear, abs=1e-9)
    assert sill - l_hi == pytest.approx(clear, abs=1e-9)
    for lo, hi in ((m_lo, m_hi), (l_lo, l_hi)):
        assert hi - lo == pytest.approx(0.60, abs=1e-9)
    assert (m_lo, m_hi) == pytest.approx((-0.11, 0.49), abs=1e-9)
    assert (l_lo, l_hi) == pytest.approx((-2.13, -1.53), abs=1e-9)
    assert m_lo < 0.0 < m_hi and l_lo < -2.00 < l_hi


@pytest.mark.parametrize("t, main, lower", [
    # WATERLINE to (band bottom, band top), m, at three stations
    (0.20, (3.374, 3.974), (1.354, 1.954)),
    (0.52, (2.991, 3.591), (0.971, 1.571)),
    (0.84, (3.981, 4.581), (1.961, 2.561)),
])
def test_waterline_to_each_wale(t, main, lower):
    from frigate import palette
    s = profiles.sheer(G, t)
    bands = {n: (s + lo, s + hi) for n, lo, hi in palette.wale_bands(G)}
    assert bands["main_wale"] == pytest.approx(main, abs=5e-4)
    assert bands["lower_wale"] == pytest.approx(lower, abs=5e-4)
    # and both stand clear of the boot top at the waterline
    assert bands["lower_wale"][0] > palette.BOOT_TOP[1]


def test_the_galleons_livery_paints_the_wales_and_leaves_her_ports_ochre():
    """`livery_band` with HER wales: black between the rows and under
    the hull row, ochre at the hull row's ports (h -1.17 to -0.47)."""
    from frigate import palette
    wales = palette.wale_bands(G)

    def band(h):
        return palette.livery_band(h, 3.0 + h, G.bulwark_h, False, wales)
    assert band(0.20) == "main_wale"
    assert band(-1.80) == "lower_wale"
    for h in (-1.17, -0.80, -0.47):
        assert band(h) == "ochre_strake"
    assert palette.BAND_COLOUR["lower_wale"] == palette.BLACK_WALE


def test_the_rigging_line_quotes_the_mizzen_shroud_rise_it_measures():
    """The Rigging line's `budget_why` names WHICH shrouds and BOTH ends:
    the MIZZEN lower shrouds, DEADEYE on the castle channel to HOUNDS
    (z 9.186), rise 1.06 m from the forward deadeye (y -10.39) down to
    0.48 m from the aftmost (y -12.95); from the waist channel at the 2.40
    drop they rose 3.61 (forward) to 2.98 m (aftmost)."""
    from frigate import budget
    rises = [s[1][2] - s[0][2] for s in ropes.lower_shrouds(G, "mizzen", 1.0)]
    assert max(rises) == pytest.approx(1.056, abs=1e-3)
    assert min(rises) == pytest.approx(0.476, abs=1e-3)
    old = dataclasses.replace(G, rail_form=dataclasses.replace(
        G.rail_form, castle_channels=(), chainplate_drop=2.40))
    before = [s[1][2] - s[0][2]
              for s in ropes.lower_shrouds(old, "mizzen", 1.0)]
    assert max(before) == pytest.approx(3.606, abs=1e-3)
    assert min(before) == pytest.approx(2.976, abs=1e-3)
    why = budget.line_of(G, "rigging").budget_why
    for figure in ("MIZZEN lower shrouds", "HOUNDS", "1.06", "0.48",
                   "3.61", "2.98"):
        assert figure in why, figure
