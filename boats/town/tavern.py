"""The tavern, planned as data. Pure -- imports no bpy.

#392's reference, English style: a two-storey tavern on a stone base. The
ground storey is coursed stone, its courses alternately set back so each
reads as a course, every block its own tone. The upper storey is jettied
over the street and half-timbered: limewashed panels in a dark oak frame of
sill beam, mid rail, top plate, posts and corner braces. A steep slate roof
in stepped courses runs along x under a ridge cap, with bargeboards on the
gables and a brick stack with two pots on the ridge. A hanging sign on an
iron bracket, two benches by the door.

Chunky, as the reference is (ADR 0002 (d)): a block is 1.8 m, a beam a third
of a metre, because the board draws the whole tavern some 60 px across at
ship zoom. Hard facets throughout -- masonry and timber -- and no texture:
tone per block, board and slate, and the occlusion `build` bakes.

Blender's frame: x across the front, the front at -y (glTF +Z, the door
side the board's layout turns), z up, the origin at the ground contact under
the plan centre. The walls of the stone storey are the footprint.
"""

import random

from . import palette as pal
from .board import TINTS
from .params import TavernParams
from .prims import Piece, WallFrame, rect, slab

# The triangles the plan comes to, part by part, so a change shows here:
#   footing 10;
#   walls 328: 148 blocks of 2 (five courses of 8, 9, 8, 9, 8 across the
#     front and back and 6, 7, 6, 7, 6 along the gables) and 16 ledges;
#   upper 294: front and back 74 each (10 panels, 4 posts, 3 beams,
#     2 braces), the gable walls 64 each (8 panels, 3 posts, 3 beams,
#     2 braces), 4 corner posts of 4 and the jetty's soffit;
#   gables 28: each its plaster 2, king post 6 and collar 6;
#   roof 498: 8 rows of 28 on each slope (6 tones a row), the undersides 4, fascias 4,
#     ridge cap 10, four bargeboards of 8;
#   chimney 68: the stack's 3 bands 24, its cap 12, two pots of 16;
#   door 36; windows 146 (4 ground of 26, 7 upper of 6); sign 38;
#   benches 44.
PLANNED_TRIANGLES = 1_490

WINDOW_COUNT = 11

COURSE_RECESS = 0.07   # every other course stands this far back
MEMBER = 0.09          # how proud the posts and braces stand
RAIL = 0.11            # the beams, a little prouder, so posts tuck behind
POST_HALF = 0.16
BEAM_HALF = 0.2
ROW_STEP = 0.12        # each slate row's butt
ROOF_SLAB = 0.2        # rows to underside
RIDGE_DROP = 0.3       # ridge cap top over the slates' ridge line
CAP_REACH = 0.45


def _frames(origin_y_front, origin_y_back, half_w, x_east=None):
    """The four walls' frames, with `u` running counter-clockwise round the
    building seen from above, so every wall's `u x v` points out."""
    x_east = half_w if x_east is None else x_east
    return {
        "front": WallFrame((0.0, origin_y_front, 0.0), (1.0, 0.0, 0.0), (0.0, -1.0, 0.0)),
        "back": WallFrame((0.0, origin_y_back, 0.0), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
        "east": WallFrame((x_east, 0.0, 0.0), (0.0, 1.0, 0.0), (1.0, 0.0, 0.0)),
        "west": WallFrame((-x_east, 0.0, 0.0), (0.0, -1.0, 0.0), (-1.0, 0.0, 0.0)),
    }


class _Tones:
    """Every colour the plan draws, from one seeded stream in a fixed order."""

    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.stone_base = pal.linear(pal.STONE)
        self.salt = pal.linear(0xD9D2C6)
        self.warm = pal.linear(0x9C8469)
        self.moss = pal.linear(pal.MOSS)

    def stone(self, low: bool = False):
        r = self.rng.random()
        c = pal.jitter(self.rng, self.stone_base, 0.2)
        if r < 0.18:
            c = pal.mix(c, self.salt, 0.35)
        elif r < 0.28:
            c = pal.mix(c, self.warm, 0.3)
        if low and self.rng.random() < 0.3:
            c = pal.mix(c, self.moss, 0.2)
        return c

    def of(self, hex_colour: int, amount: float):
        return pal.jitter(self.rng, pal.linear(hex_colour), amount)

    def slate(self):
        c = self.of(pal.SLATE, 0.16)
        r = self.rng.random()
        if r < 0.1:
            c = pal.mix(c, self.moss, 0.3)
        elif r < 0.18:
            c = pal.mix(c, self.salt, 0.2)
        return c


def _cuts(lo: float, hi: float, count: int, stagger: bool) -> list:
    step = (hi - lo) / count
    inner = [lo + (j + 0.5) * step for j in range(count)] if stagger else \
        [lo + j * step for j in range(1, count)]
    return [lo] + inner + [hi]


def _stone_storey(piece: Piece, p: TavernParams, tones: _Tones):
    walls = piece.part("Walls")
    W, D, G = p.half_width, p.half_depth, p.ground_storey
    n = p.stone_courses
    recess = [0.0 if k % 2 == 0 else COURSE_RECESS for k in range(n)]
    for k in range(n):
        z0, z1, r = G * k / n, G * (k + 1) / n, recess[k]
        frames = _frames(-(D - r), D - r, W - r)
        for name, half in (("front", W - r), ("east", D - r),
                           ("back", W - r), ("west", D - r)):
            count = max(2, round(2 * half / p.block_length))
            cuts = _cuts(-half, half, count, stagger=k % 2 == 1)
            for u0, u1 in zip(cuts, cuts[1:]):
                slab(walls, frames[name], rect(u0, z0, u1, z1), 0.0,
                     tones.stone(low=k == 0), TINTS["none"], sides=())
    mortar = pal.linear(pal.MORTAR)
    for k in range(n - 1):
        z, lo_r, hi_r = G * (k + 1) / n, recess[k], recess[k + 1]
        ow, od, iw, id_ = W - lo_r, D - lo_r, W - hi_r, D - hi_r
        up = 1.0 if lo_r < hi_r else -1.0
        rings = (((-ow, -od), (ow, -od), (iw, -id_), (-iw, -id_)),
                 ((ow, -od), (ow, od), (iw, id_), (iw, -id_)),
                 ((ow, od), (-ow, od), (-iw, id_), (iw, id_)),
                 ((-ow, od), (-ow, -od), (-iw, -id_), (-iw, id_)))
        for quad in rings:
            walls.face([(x, y, z) for x, y in quad], mortar, TINTS["none"],
                       out=(0.0, 0.0, up))


def _upper_storey(piece: Piece, p: TavernParams, tones: _Tones, glass_at: list):
    upper = piece.part("Upper")
    windows = piece.part("Windows")
    W, D, G, U, J = p.half_width, p.half_depth, p.ground_storey, p.upper_storey, p.jetty
    yf, yb = -(D + J), D
    zm = G + 1.45
    frames = _frames(yf, yb, W)
    spans = {"front": (-W, W, 5), "back": (-W, W, 5),
             "east": (yf, yb, 4), "west": (-yb, -yf, 4)}
    # Which bays hold a window: the front's middle three, the back's second
    # and fourth, one on each gable wall. Braces stand in the corner bays.
    window_bays = {"front": (1, 2, 3), "back": (1, 3), "east": (1,), "west": (1,)}
    for name in ("front", "east", "back", "west"):
        frame = frames[name]
        ua, ub, bays = spans[name]
        cuts = [ua + (ub - ua) * j / bays for j in range(bays + 1)]
        for u0, u1 in zip(cuts, cuts[1:]):
            for v0, v1 in ((G, zm), (zm, U)):
                slab(upper, frame, rect(u0, v0, u1, v1), 0.0,
                     tones.of(pal.PLASTER, 0.05), TINTS["wall"], sides=())
        for v0, v1 in ((G, G + 2 * BEAM_HALF), (zm - POST_HALF, zm + POST_HALF),
                       (U - 2 * BEAM_HALF, U)):
            slab(upper, frame, rect(ua, v0, ub, v1), RAIL,
                 tones.of(pal.OAK, 0.12), TINTS["trim"], sides=(0, 2))
        for c in cuts[1:-1]:
            slab(upper, frame,
                 rect(c - POST_HALF, G + 2 * BEAM_HALF, c + POST_HALF, U - 2 * BEAM_HALF),
                 MEMBER, tones.of(pal.OAK, 0.12), TINTS["trim"], sides=(1, 3))
        v0, v1, w = zm + POST_HALF, U - 2 * BEAM_HALF, 0.45
        for a, b in ((cuts[0] + 0.25, cuts[1] - POST_HALF),
                     (cuts[-1] - 0.25, cuts[-2] + POST_HALF)):
            if a < b:
                poly = [(a, v0), (a + w, v0), (b, v1), (b - w, v1)]
            else:
                poly = [(a - w, v0), (a, v0), (b + w, v1), (b, v1)]
            slab(upper, frame, poly, MEMBER, tones.of(pal.OAK, 0.12),
                 TINTS["trim"], sides=(1, 3))
        for bay in window_bays[name]:
            c = (cuts[bay] + cuts[bay + 1]) / 2
            lo_v, hi_v = zm + POST_HALF + 0.25, U - 2 * BEAM_HALF - 0.3
            slab(windows, frame, rect(c - 0.75, lo_v, c + 0.75, hi_v), 0.03,
                 tones.of(pal.GLASS, 0.08), TINTS["glass"], sides=())
            _glazing_bars(windows, frame, c, lo_v, hi_v, 0.75, tones)
            glass_at.append(frame.at(c, (lo_v + hi_v) / 2, 0.1))
    # The corner posts, each showing its two outer faces.
    oak = pal.linear(pal.OAK)
    for sx in (-1.0, 1.0):
        for y_wall, sy in ((yf, -1.0), (yb, 1.0)):
            xs = sorted((sx * (W - 0.3), sx * (W + RAIL)))
            ys = sorted((y_wall - sy * 0.3, y_wall + sy * RAIL))
            keep = {("+x" if sx > 0 else "-x"), ("+y" if sy > 0 else "-y")}
            upper.box((xs[0], ys[0], G), (xs[1], ys[1], U), oak, TINTS["trim"],
                      skip={"+x", "-x", "+y", "-y", "+z", "-z"} - keep)
    # The jetty's soffit, under the overhang.
    upper.face(((-W, yf, G), (W, yf, G), (W, -D, G), (-W, -D, G)),
               pal.mix(oak, pal.linear(pal.PLASTER), 0.5), TINTS["none"],
               out=(0.0, 0.0, -1.0))


def _glazing_bars(part, frame, c, lo_v, hi_v, half, tones):
    mid = (lo_v + hi_v) / 2
    slab(part, frame, rect(c - 0.05, lo_v, c + 0.05, hi_v), 0.05,
         tones.of(pal.OAK, 0.1), TINTS["trim"], sides=())
    slab(part, frame, rect(c - half, mid - 0.05, c + half, mid + 0.05), 0.06,
         tones.of(pal.OAK, 0.1), TINTS["trim"], sides=())


def _roof_numbers(p: TavernParams):
    yf, yb = -(p.half_depth + p.jetty), p.half_depth
    yc, s = (yf + yb) / 2, (yb - yf) / 2
    zr = p.ridge - RIDGE_DROP
    pitch = (zr - (p.upper_storey + ROOF_SLAB)) / s
    return yc, s, zr, pitch


def _gables(piece: Piece, p: TavernParams, tones: _Tones):
    gables = piece.part("Gables")
    W, D, U, J = p.half_width, p.half_depth, p.upper_storey, p.jetty
    yf, yb = -(D + J), D
    yc, s, zr, _ = _roof_numbers(p)
    apex = zr - ROOF_SLAB
    frames = _frames(yf, yb, W)
    for name, (ua, ub) in (("east", (yf, yb)), ("west", (-yb, -yf))):
        frame = frames[name]
        uc = (ua + ub) / 2
        slab(gables, frame, [(ua, U), (uc, U), (uc, apex)], 0.0,
             tones.of(pal.PLASTER, 0.05), TINTS["wall"], sides=())
        slab(gables, frame, [(uc, U), (ub, U), (uc, apex)], 0.0,
             tones.of(pal.PLASTER, 0.05), TINTS["wall"], sides=())
        slab(gables, frame, rect(uc - POST_HALF, U, uc + POST_HALF, apex - 0.35),
             MEMBER, tones.of(pal.OAK, 0.12), TINTS["trim"], sides=(1, 3))
        v = U + 0.5 * (apex - U)
        reach = (ub - ua) / 2 * (1.0 - (v - U) / (apex - U)) - 0.15
        slab(gables, frame, rect(uc - reach, v - BEAM_HALF, uc + reach, v + BEAM_HALF),
             RAIL, tones.of(pal.OAK, 0.12), TINTS["trim"], sides=(0, 2))


def _roof(piece: Piece, p: TavernParams, tones: _Tones):
    roof = piece.part("Roof")
    yc, s, zr, t = _roof_numbers(p)
    X = p.half_width + p.gable_overhang
    a_max = s + p.eave_overhang
    zb = lambda a: zr - t * a              # noqa: E731 -- the slates' base line
    under = lambda a: zb(a) - ROOF_SLAB    # noqa: E731
    rows = p.slate_rows
    a = [0.3 + (a_max - 0.3) * i / rows for i in range(rows + 1)]
    for side in (-1.0, 1.0):               # -1 the front slope, +1 the back
        y = lambda d: yc + side * d        # noqa: E731
        up = (0.0, side * t, 1.0)
        for i in range(rows):
            a0, a1 = a[i], a[i + 1]
            shift = tones.rng.uniform(-0.5, 0.5)
            cuts = [-X] + [-X + 2 * X * j / p.slate_segments + shift
                           for j in range(1, p.slate_segments)] + [X]
            for x0, x1 in zip(cuts, cuts[1:]):
                c = tones.slate()
                roof.face(((x0, y(a0), zb(a0)), (x1, y(a0), zb(a0)),
                           (x1, y(a1), zb(a1) + ROW_STEP), (x0, y(a1), zb(a1) + ROW_STEP)),
                          c, TINTS["roof"], out=up)
                roof.face(((x0, y(a1), zb(a1)), (x1, y(a1), zb(a1)),
                           (x1, y(a1), zb(a1) + ROW_STEP), (x0, y(a1), zb(a1) + ROW_STEP)),
                          pal.mix(c, (0.0, 0.0, 0.0), 0.35), TINTS["roof"],
                          out=(0.0, side, 0.0))
            for sx in (-1.0, 1.0):
                roof.face(((sx * X, y(a0), under(a0)), (sx * X, y(a1), under(a1)),
                           (sx * X, y(a1), zb(a1) + ROW_STEP), (sx * X, y(a0), zb(a0))),
                          tones.of(pal.SLATE, 0.1), TINTS["roof"], out=(sx, 0.0, 0.0))
        dark = pal.mix(pal.linear(pal.OAK), (0.0, 0.0, 0.0), 0.2)
        roof.face(((-X, y(0.0), under(0.0)), (X, y(0.0), under(0.0)),
                   (X, y(a_max), under(a_max)), (-X, y(a_max), under(a_max))),
                  dark, TINTS["none"], out=(0.0, -side * t, -1.0))
        roof.face(((-X, y(a_max), under(a_max)), (X, y(a_max), under(a_max)),
                   (X, y(a_max), zb(a_max)), (-X, y(a_max), zb(a_max))),
                  tones.of(pal.OAK, 0.1), TINTS["trim"], out=(0.0, side, 0.0))
    # The ridge cap, in two lengths of tile.
    base = zb(CAP_REACH) - 0.02
    for x0, x1 in ((-X, 0.0), (0.0, X)):
        c = pal.mix(tones.of(pal.SLATE, 0.08), (0.0, 0.0, 0.0), 0.25)
        for side in (-1.0, 1.0):
            roof.face(((x0, yc + side * CAP_REACH, base), (x1, yc + side * CAP_REACH, base),
                       (x1, yc, p.ridge), (x0, yc, p.ridge)),
                      c, TINTS["roof"], out=(0.0, side, 1.0))
    for sx in (-1.0, 1.0):
        roof.face(((sx * X, yc - CAP_REACH, base), (sx * X, yc + CAP_REACH, base),
                   (sx * X, yc, p.ridge)), tones.of(pal.SLATE, 0.08), TINTS["roof"],
                  out=(sx, 0.0, 0.0))
    # The bargeboards, outside each verge.
    for sx in (-1.0, 1.0):
        x_in, x_out = sx * X, sx * (X + 0.12)
        for side in (-1.0, 1.0):
            c = tones.of(pal.OAK, 0.12)
            top0, top1 = zb(0.0) + ROW_STEP + 0.05, zb(a_max) + ROW_STEP + 0.05
            bot0, bot1 = zb(0.0) - 0.4, zb(a_max) - 0.4
            y0, y1 = yc, yc + side * a_max
            roof.face(((x_out, y0, bot0), (x_out, y1, bot1), (x_out, y1, top1), (x_out, y0, top0)),
                      c, TINTS["trim"], out=(sx, 0.0, 0.0))
            roof.face(((x_in, y0, top0), (x_out, y0, top0), (x_out, y1, top1), (x_in, y1, top1)),
                      c, TINTS["trim"], out=(0.0, side * t, 1.0))
            roof.face(((x_in, y0, bot0), (x_out, y0, bot0), (x_out, y1, bot1), (x_in, y1, bot1)),
                      c, TINTS["trim"], out=(0.0, -side * t, -1.0))
            roof.face(((x_in, y1, bot1), (x_out, y1, bot1), (x_out, y1, top1), (x_in, y1, top1)),
                      c, TINTS["trim"], out=(0.0, side, 0.0))


def _chimney(piece: Piece, p: TavernParams, tones: _Tones):
    chimney = piece.part("Chimney")
    yc, _s, zr, _t = _roof_numbers(p)
    cx, c = p.chimney_x, p.chimney_half
    stack_top = p.height - 0.75
    z0 = zr - 1.6
    bands = 3
    for b in range(bands):
        lo = z0 + (stack_top - z0) * b / bands
        hi = z0 + (stack_top - z0) * (b + 1) / bands
        chimney.box((cx - c, yc - c, lo), (cx + c, yc + c, hi), tones.of(pal.BRICK, 0.1),
                    TINTS["none"], skip={"+z", "-z"})
    cap = c + 0.14
    chimney.box((cx - cap, yc - cap, stack_top - 0.05), (cx + cap, yc + cap, stack_top + 0.25),
                pal.mix(pal.linear(pal.STONE), (0.0, 0.0, 0.0), 0.15), TINTS["none"])
    import math
    for px in (cx - 0.38, cx + 0.38):
        ring = [(px + 0.24 * math.cos(math.pi / 3 * k), yc + 0.24 * math.sin(math.pi / 3 * k))
                for k in range(6)]
        colour = tones.of(pal.POT, 0.08)
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            mid = ((x0 + x1) / 2 - px, (y0 + y1) / 2 - yc, 0.0)
            chimney.face(((x0, y0, stack_top + 0.25), (x1, y1, stack_top + 0.25),
                          (x1, y1, p.height), (x0, y0, p.height)),
                         colour, TINTS["none"], out=mid)
        chimney.face([(x, y, p.height) for x, y in ring],
                     pal.mix(colour, (0.0, 0.0, 0.0), 0.7), TINTS["none"], out=(0.0, 0.0, 1.0))
    piece.anchors["Chimney_00"] = (cx, yc, p.height)


def _ground_openings(piece: Piece, p: TavernParams, tones: _Tones, glass_at: list):
    door = piece.part("Door")
    windows = piece.part("Windows")
    D = p.half_depth
    frames = _frames(-D, D, p.half_width)
    front = frames["front"]
    stone = pal.mix(pal.linear(pal.STONE), pal.linear(0xD9D2C6), 0.25)
    for j in range(3):
        u0 = -0.85 + 1.7 * j / 3
        slab(door, front, rect(u0, 0.25, u0 + 1.7 / 3, 2.95), 0.04,
             tones.of(pal.DOOR, 0.1), TINTS["shutter"], sides=())
    for sign in (-1.0, 1.0):
        lo, hi = sorted((sign * 0.85, sign * 1.12))
        slab(door, front, rect(lo, 0.0, hi, 3.0), 0.16, stone, TINTS["none"], sides=(1, 3))
    slab(door, front, rect(-1.25, 3.0, 1.25, 3.45), 0.18, stone, TINTS["none"])
    door.box((-1.25, -D - 0.6, 0.0), (1.25, -D, 0.25), stone, TINTS["none"],
             skip={"+y", "-z"})
    for name, centres in (("front", (-4.5, 4.5)), ("back", (-3.5, 3.5))):
        frame = frames[name]
        for c in centres:
            slab(windows, frame, rect(c - 0.7, 1.5, c + 0.7, 3.2), 0.03,
                 tones.of(pal.GLASS, 0.08), TINTS["glass"], sides=())
            _glazing_bars(windows, frame, c, 1.5, 3.2, 0.7, tones)
            slab(windows, frame, rect(c - 0.85, 3.2, c + 0.85, 3.55), 0.16, stone, TINTS["none"])
            slab(windows, frame, rect(c - 0.85, 1.3, c + 0.85, 1.5), 0.2, stone, TINTS["none"])
            glass_at.append(frame.at(c, 2.35, 0.1))


def _sign(piece: Piece, p: TavernParams, tones: _Tones):
    sign = piece.part("Sign")
    sx, yf, h = -5.72, -(p.half_depth + p.jetty), p.sign_height
    iron = pal.linear(pal.IRON)
    sign.box((sx - 0.07, yf - 1.5, h + 0.05), (sx + 0.07, yf, h + 0.2), iron, TINTS["none"],
             skip={"+y"})
    face = tones.of(pal.SIGN, 0.06)
    edge = tones.of(pal.OAK, 0.1)
    sign.box((sx - 0.08, yf - 1.35, h - 1.35), (sx + 0.08, yf - 0.35, h - 0.35), edge,
             TINTS["shutter"], colours={"+x": face, "-x": face})
    for cy in (yf - 0.45, yf - 1.25):
        sign.box((sx - 0.03, cy - 0.03, h - 0.35), (sx + 0.03, cy + 0.03, h + 0.05), iron,
                 TINTS["none"], skip={"+z", "-z"})


def _benches(piece: Piece, p: TavernParams, tones: _Tones):
    benches = piece.part("Benches")
    D = p.half_depth
    centres = (-2.35, 2.35)[: p.benches]
    for bx in centres:
        wood = tones.of(pal.BENCH, 0.1)
        benches.box((bx - 1.0, -D - 0.85, 0.62), (bx + 1.0, -D - 0.25, 0.8), wood,
                    TINTS["none"], skip={"+y"})
        for lx in (bx - 0.8, bx + 0.8):
            benches.box((lx - 0.07, -D - 0.8, 0.0), (lx + 0.07, -D - 0.3, 0.62),
                        pal.mix(wood, (0.0, 0.0, 0.0), 0.2), TINTS["none"],
                        skip={"+z", "-z", "+y"})


def plan(p: TavernParams | None = None) -> Piece:
    """The whole tavern as named parts of faces, and its anchors."""
    p = p or TavernParams()
    p.validate()
    tones = _Tones(p.seed)
    piece = Piece()
    W, D, pp = p.half_width, p.half_depth, p.plinth_proud
    piece.part("Footing").box((-(W + pp), -(D + pp), -p.footing), (W + pp, D + pp, 0.2),
                              pal.mix(pal.linear(pal.STONE), (0.0, 0.0, 0.0), 0.2),
                              TINTS["none"], skip={"-z"})
    glass_at: list = []
    _stone_storey(piece, p, tones)
    _upper_storey(piece, p, tones, glass_at)
    _gables(piece, p, tones)
    _roof(piece, p, tones)
    _chimney(piece, p, tones)
    _ground_openings(piece, p, tones, glass_at)
    _sign(piece, p, tones)
    _benches(piece, p, tones)
    for i, at in enumerate(glass_at):
        piece.anchors[f"Window_{i:02d}"] = at
    return piece
