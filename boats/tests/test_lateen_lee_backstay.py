"""The lee backstay of a mast that sets a lateen does not cut its canvas.

No bpy. Blender's `check_intersections` on the galleon rebuilt at 8c21587
found the mizzen's two +x backstays (x 0.26..3.48, y -13.15..-10.80,
z 6.68..15.52) through 7 faces of the lateen's belly (y -12.14..-10.93,
z 11.83..13.29), just abaft and above the slings, which the ruled spar
raised from z 11.21 to 13.25. +x is the LEE side: the shared wind pushes
the canvas toward +x, so the belly stands out to x 1.5356 on that side and
nowhere on the other.

Measured here on the sail grid `sails` emits and the rope segments `ropes`
emits, both endpoints named: the lee backstay 0 runs from head
(0.30, -10.8003, 15.51) to foot (3.3889, -13.148, 6.8143) and crosses the
canvas grid; lee backstay 1 (foot (3.4414, -12.698, 6.6945)) passes 0.0278 m
from a canvas vertex, inside its own 0.075 m ribbon. The windward pair
clears by 0.85 m.
"""

import math

import pytest

from frigate import profiles, ropes, sailplan
from frigate.params import FrigateParams, GalleonParams

G = GalleonParams()
F = FrigateParams()


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _segment_hits_triangle(p0, p1, a, b, c) -> bool:
    """Moller-Trumbore, restricted to the segment p0..p1."""
    d, e1, e2 = _sub(p1, p0), _sub(b, a), _sub(c, a)
    h = _cross(d, e2)
    det = _dot(e1, h)
    if abs(det) < 1e-14:
        return False
    s = _sub(p0, a)
    u = _dot(s, h) / det
    if not 0.0 <= u <= 1.0:
        return False
    q = _cross(s, e1)
    v = _dot(d, q) / det
    if v < 0.0 or u + v > 1.0:
        return False
    return 0.0 <= _dot(e2, q) / det <= 1.0


def _point_to_segment(pt, a, b) -> float:
    ab = _sub(b, a)
    t = max(0.0, min(1.0, _dot(_sub(pt, a), ab) / _dot(ab, ab)))
    return math.dist(pt, tuple(a[i] + ab[i] * t for i in range(3)))


def _lateen_grids(p, nu, nv):
    return [sailplan.sail_grid(p, m, s, nu, nv)
            for m, s in sailplan.all_sails(p) if s.kind.name == "LATEEN"]


def _backstay_segments(p):
    return [seg for kind, rope in ropes.all_ropes(p) if kind == "backstay"
            for seg in zip(rope, rope[1:])]


@pytest.mark.parametrize("nu,nv", [(profiles.SAIL_NU, profiles.SAIL_NV),
                                   (81, 81)])
def test_no_backstay_crosses_lateen_canvas(nu, nv):
    """On the grid Blender builds, and on a fine one."""
    crossings = 0
    for grid in _lateen_grids(G, nu, nv):
        for a, b in _backstay_segments(G):
            for r0, r1 in zip(grid, grid[1:]):
                for i in range(nu - 1):
                    A, B, C, D = r0[i], r0[i + 1], r1[i + 1], r1[i]
                    crossings += _segment_hits_triangle(a, b, A, B, C)
                    crossings += _segment_hits_triangle(a, b, A, C, D)
    assert crossings == 0


def test_every_backstay_stands_clear_of_lateen_canvas_by_its_own_width():
    """ROPE SEGMENT to nearest CANVAS VERTEX, at least the backstay ribbon's
    own width (0.075 m), so the ribbon Blender draws cannot touch either."""
    width = ropes.ROPE_STYLE["backstay"][0]
    segments = _backstay_segments(G)
    worst = min(_point_to_segment(q, a, b)
                for grid in _lateen_grids(G, 81, 81)
                for row in grid for q in row
                for a, b in segments)
    assert worst > width


def test_a_mast_setting_no_lateen_keeps_all_four_backstays():
    """Two a side on every mast but one that sets a lateen, which casts off
    its lee pair. Derived from the rig, not counted to fit."""
    for p in (F, G):
        n_masts = len(profiles.mast_names(p))
        n_lateen = len(profiles.lateen_masts(p))
        assert ropes.kind_counts(p)["backstay"] == 4 * n_masts - 2 * n_lateen
