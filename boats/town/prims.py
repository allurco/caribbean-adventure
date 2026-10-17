"""Faces and parts as plain data. Pure -- imports no bpy.

A piece is named parts; a part is faces; a face is a planar polygon (its
points wound counter-clockwise seen from outside, so its normal points out),
one linear colour and one tint channel. Every face keeps its own corners:
masonry and timber are hard-faceted (ADR 0002 (d)), so no corner is shared
and the export splits nothing.
"""

import math
from dataclasses import dataclass, field


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


@dataclass
class Face:
    points: tuple
    colour: tuple
    tint: int

    def normal(self) -> tuple:
        """Newell's normal, its length twice the area."""
        nx = ny = nz = 0.0
        pts = self.points
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            nx += (a[1] - b[1]) * (a[2] + b[2])
            ny += (a[2] - b[2]) * (a[0] + b[0])
            nz += (a[0] - b[0]) * (a[1] + b[1])
        return (nx, ny, nz)

    def area(self) -> float:
        return 0.5 * math.sqrt(sum(c * c for c in self.normal()))

    def centre(self) -> tuple:
        n = len(self.points)
        return tuple(sum(p[i] for p in self.points) / n for i in range(3))


@dataclass
class Part:
    faces: list = field(default_factory=list)

    def face(self, points, colour, tint, out=None):
        """Add one face. With `out`, the face is wound so its normal points
        along `out` (a direction), whichever way its points were listed."""
        pts = tuple(tuple(float(c) for c in p) for p in points)
        f = Face(pts, tuple(colour), int(tint))
        if out is not None and _dot(f.normal(), out) < 0:
            f = Face(tuple(reversed(pts)), f.colour, f.tint)
        self.faces.append(f)
        return f

    def box(self, lo, hi, colour, tint, skip=(), colours=None):
        """An axis-aligned box; `skip` names faces left out ("+x", "-z", ...),
        `colours` overrides the colour per face name."""
        (lx, ly, lz), (hx, hy, hz) = lo, hi
        quads = {
            "+x": ((hx, ly, lz), (hx, hy, lz), (hx, hy, hz), (hx, ly, hz)),
            "-x": ((lx, hy, lz), (lx, ly, lz), (lx, ly, hz), (lx, hy, hz)),
            "+y": ((hx, hy, lz), (lx, hy, lz), (lx, hy, hz), (hx, hy, hz)),
            "-y": ((lx, ly, lz), (hx, ly, lz), (hx, ly, hz), (lx, ly, hz)),
            "+z": ((lx, ly, hz), (hx, ly, hz), (hx, hy, hz), (lx, hy, hz)),
            "-z": ((lx, hy, lz), (hx, hy, lz), (hx, ly, lz), (lx, ly, lz)),
        }
        for name, quad in quads.items():
            if name in skip:
                continue
            self.face(quad, (colours or {}).get(name, colour), tint)

    def triangles(self) -> int:
        return sum(len(f.points) - 2 for f in self.faces)


@dataclass(frozen=True)
class WallFrame:
    """A wall's own frame: `u` along it, `v` up, `n` out of it. `u x v` is the
    outward normal, so a polygon wound counter-clockwise in (u, v) faces out.
    """
    origin: tuple
    u: tuple
    n: tuple

    def at(self, u: float, v: float, n: float = 0.0) -> tuple:
        o, a, b = self.origin, self.u, self.n
        return (o[0] + a[0] * u + b[0] * n,
                o[1] + a[1] * u + b[1] * n,
                o[2] + v + b[2] * n)


def slab(part: Part, frame: WallFrame, poly, depth: float, colour, tint,
         sides=None, base: float = 0.0, side_colour=None):
    """A flat member laid on a wall: polygon `poly` in (u, v), wound
    counter-clockwise, standing `depth` proud of the wall at `base`. Its front
    face, and a side face along each edge whose index is in `sides` (all of
    them when None)."""
    front = [frame.at(u, v, base + depth) for u, v in poly]
    part.face(front, colour, tint)
    for i, (a, b) in enumerate(zip(poly, poly[1:] + poly[:1])):
        if sides is not None and i not in sides:
            continue
        part.face((frame.at(a[0], a[1], base), frame.at(b[0], b[1], base),
                   frame.at(b[0], b[1], base + depth),
                   frame.at(a[0], a[1], base + depth)),
                  side_colour or colour, tint)


def rect(u0, v0, u1, v1):
    """A rectangle in (u, v), counter-clockwise: bottom, right, top, left."""
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


@dataclass
class Piece:
    parts: dict = field(default_factory=dict)
    anchors: dict = field(default_factory=dict)

    def part(self, name: str) -> Part:
        return self.parts.setdefault(name, Part())

    def triangles(self) -> int:
        return sum(p.triangles() for p in self.parts.values())

    def _bounds(self, faces) -> tuple:
        pts = [p for f in faces for p in f.points]
        return (tuple(min(p[i] for p in pts) for i in range(3)),
                tuple(max(p[i] for p in pts) for i in range(3)))

    def part_bounds(self, name: str) -> tuple:
        return self._bounds(self.parts[name].faces)

    def bounds(self) -> tuple:
        return self._bounds([f for p in self.parts.values() for f in p.faces])
