"""The tavern casts a solid shadow (#431).

The board draws the tavern with one-sided materials, and three.js renders a
one-sided mesh into the shadow map by its back faces: a ray of sunlight is
stopped only by a face turned away from the sun. A closed shell stops every
ray through its inside, since a ray leaving it must cross a face turned along
the ray. A slit in the shell -- #427's recessed top course left one under the
jettied storey -- lets a sheet of light through, drawn on the ground as a
bright line through the shadow.

So: from every side the sun may stand (the layout turns the tavern to any
yaw) and at the board's sun heights, every ray through the inside of the
building meets a face turned away from the sun.
"""

import math

from town import tavern
from town.params import TavernParams

P = TavernParams()
PLAN = tavern.plan(P)


def _triangles(piece):
    """Every face fanned into triangles, each with its face's normal."""
    tris = []
    for part in piece.parts.values():
        for f in part.faces:
            n = f.normal()
            a = f.points[0]
            for b, c in zip(f.points[1:], f.points[2:]):
                tris.append((a, b, c, n))
    return tris


TRIS = _triangles(PLAN)


def _hits_back_face(origin, d):
    """Whether the line through `origin` along `d`, above the ground,
    crosses a triangle whose normal points along `d` (a back face as seen
    from the light). The footing below the ground casts on nothing."""
    for a, b, c, n in TRIS:
        if n[0] * d[0] + n[1] * d[1] + n[2] * d[2] <= 0.0:
            continue
        e1 = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        e2 = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        pv = (d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2],
              d[0] * e2[1] - d[1] * e2[0])
        det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2]
        if abs(det) < 1e-12:
            continue
        inv = 1.0 / det
        tv = (origin[0] - a[0], origin[1] - a[1], origin[2] - a[2])
        u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv
        if u < 0.0 or u > 1.0:
            continue
        qv = (tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2],
              tv[0] * e1[1] - tv[1] * e1[0])
        v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv
        if v < 0.0 or u + v > 1.0:
            continue
        t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv
        if origin[2] + t * d[2] >= -1e-9:
            return True
    return False


def _sun_rays():
    """Light directions (sun to ground): eight azimuths at three heights."""
    for elevation in (25.0, 40.0, 60.0):
        e = math.radians(elevation)
        for k in range(8):
            az = math.radians(22.5 + 45.0 * k)
            yield (-math.cos(e) * math.cos(az), -math.cos(e) * math.sin(az), -math.sin(e))


def _inside_points():
    """Points inside the building, hugging the walls at the heights where
    the storeys and the roof meet, where a slit would open."""
    W, D, G, U = P.half_width, P.half_depth, P.ground_storey, P.upper_storey
    inset = P.course_recess + 0.1
    heights = (1.0, G - 0.05, G + 0.05, G + 0.4, U - 0.05, U + 0.2)
    for z in heights:
        for x in (-(W - inset), 0.0, W - inset):
            for y in (-(D - inset), 0.0, D - inset):
                if x == 0.0 and y == 0.0:
                    continue
                yield (x, y, z)


def _lands_under_the_tavern(origin, d):
    """Whether the ray reaches the ground under the stone storey's bottom
    course, where no one sees the light."""
    t = -origin[2] / d[2]
    x, y = origin[0] + t * d[0], origin[1] + t * d[1]
    return abs(x) < P.half_width and abs(y) < P.half_depth


def test_every_ray_of_sun_through_the_tavern_meets_a_face_that_casts():
    leaks = [(pt, d) for d in _sun_rays() for pt in _inside_points()
             if not _lands_under_the_tavern(pt, d) and not _hits_back_face(pt, d)]
    assert not leaks, f"{len(leaks)} rays pass through, e.g. {leaks[:3]}"
