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


# The board's sun stands 22 degrees up at its golden hour (`GOLDEN_HOUR` in
# src/board/visuals/lighting.ts); the higher suns cover the times of day.
BOARD_SUN_ELEVATION = 22.0


def _sun_rays():
    """Light directions (sun to ground): eight azimuths at four heights."""
    for elevation in (BOARD_SUN_ELEVATION, 25.0, 40.0, 60.0):
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


def _basis(d):
    """Two unit vectors square to `d` and to each other."""
    a = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = (a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0])
    m = math.sqrt(sum(c * c for c in e1))
    e1 = tuple(c / m for c in e1)
    e2 = (d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0])
    return e1, e2


def _hit_kinds(origin, d, tris):
    """Whether the line meets, above the ground, a face turned to the sun
    (light comes in) and a face turned away (the shadow map sees it)."""
    lit = cast = False
    for a, b, c, n in tris:
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
        if origin[2] + t * d[2] < 0.0:
            continue
        if n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0.0:
            cast = True
        else:
            lit = True
    return lit, cast


def _open_bottoms():
    """Ground no one sees: under the footing, the door's step and each bench."""
    W, D = P.half_width + P.plinth_proud, P.half_depth + P.plinth_proud
    rects = [(-W, -D, W, D)]
    (x0, y0, _), (x1, y1, _) = PLAN.part_bounds("Door")
    rects.append((x0, y0, x1, y1))
    for sx in (-1.0, 1.0):
        pts = [p for f in PLAN.parts["Benches"].faces for p in f.points if p[0] * sx > 0]
        rects.append((min(p[0] for p in pts), min(p[1] for p in pts),
                      max(p[0] for p in pts), max(p[1] for p in pts)))
    return rects


def test_no_sliver_of_sun_passes_through_any_member():
    # Every ray the tavern stops at all it must stop whole: light that comes
    # in through a face turned to the sun leaves through one turned away, or
    # lands where no one sees it. Sweeps the whole silhouette at a tenth of a
    # metre, from the four quarters at the board's sun and a higher one.
    hidden = _open_bottoms()
    leaks = []
    for elevation, k in ((el, k) for el in (BOARD_SUN_ELEVATION, 35.0) for k in range(4)):
        az, e = math.radians(30.0 + 90.0 * k), math.radians(elevation)
        d = (-math.cos(e) * math.cos(az), -math.cos(e) * math.sin(az), -math.sin(e))
        e1, e2 = _basis(d)
        cell = 0.5
        buckets: dict = {}
        for tri in TRIS:
            ss = [sum(p[i] * e1[i] for i in range(3)) for p in tri[:3]]
            ts = [sum(p[i] * e2[i] for i in range(3)) for p in tri[:3]]
            for i in range(math.floor(min(ss) / cell), math.floor(max(ss) / cell) + 1):
                for j in range(math.floor(min(ts) / cell), math.floor(max(ts) / cell) + 1):
                    buckets.setdefault((i, j), []).append(tri)
        step = 0.1
        for (i, j), tris in buckets.items():
            for a in range(5):
                for b in range(5):
                    s, t = (i * cell + (a + 0.5) * step, j * cell + (b + 0.5) * step)
                    o = tuple(s * e1[c] + t * e2[c] for c in range(3))
                    lit, cast = _hit_kinds(o, d, tris)
                    if not lit or cast:
                        continue
                    g = o[2] / -d[2]
                    x, y = o[0] + g * d[0], o[1] + g * d[1]
                    if any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in hidden):
                        continue
                    leaks.append((round(x, 2), round(y, 2), elevation, k))
    assert not leaks, f"{len(leaks)} slivers of sun on the ground, e.g. {leaks[:5]}"
