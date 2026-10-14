"""What a painted shot scar looks like. Pure: no bpy, no numpy.

WHY THIS MODULE EXISTS. The previous pass corrected the nine shot scars from
standing 0.151 m PROUD of the hull to being cut 2 mm into it, under the ruling
`Damage -> Hull, INTO`. That is right, and it made them invisible: a depression
in a CLOSED surface cannot be shown by putting geometry behind it, because the
skin is still in front. The maintainer's ruling is to paint them instead — splintered
pale wood in the `hull_timber` albedo atlas, and a real dent in its normal map,
which is the tool a depression actually belongs in. The recessed geometry
stays; nothing here moves a vertex.

THE ATLAS IS THE LIMIT AND IT IS STATED, NOT HOPED FOR. Measured on the
shipped unwrap: the Hull's own texels run at 14.03 per metre — hull world area
1010.25 m2 against a UV area of 0.18965 of the 1024 square. So a 0.40 m crater
is 11 texels across and the painted splinter field around it is 20. Twenty
texels of colour on their own would be a smudge at any distance; what makes a
scar read at that size is the SHADING, which is why the normal map carries a
0.12 m bowl and a 12 mm splintered lip and the albedo only tints it.

EVERYTHING IS MEASURED IN TWO PLACES AND BOTH ARE NAMED. `d` is the distance
from the scar's centre to the texel, divided by the PAINT radius (the splinter
field), not by the crater radius; `BOWL_EDGE` is where the crater rim falls
inside that, at 1 / PAINT_RADIUS_FACTOR. Heights are metres from the
undisturbed planking surface, negative into it.

THE PATTERN IS DETERMINISTIC. `tangent_basis` and `edge` take no seed and no
random state: the bake must come out the same twice running, or the
byte-identical-image guard in `frigate.export` starts failing for a reason
that has nothing to do with the exporter.
"""

import math

# --- how far the paint reaches ----------------------------------------------

# Splinters radiate past the hole they came out of, so the paint is wider than
# the crater. 1.8 is also what buys the scar enough texels to be a shape: at
# 14.03 texels per metre a 0.40 m crater paints 20 texels across rather than 11.
PAINT_RADIUS_FACTOR = 1.8

# Where the crater rim sits inside the painted field, in units of `d`.
BOWL_EDGE = 1.0 / PAINT_RADIUS_FACTOR

# Inside this the albedo is at full strength. It is deliberately `BOWL_EDGE`
# to within a thousandth: the paint is solid across the crater itself and
# ramps out across the splinter field around it, so the two halves of the
# scar — hole and splinters — are the two halves of the falloff.
CORE_EDGE = 0.55

# The ragged outline. A circle would read as a drill hole.
LOBE_COUNT = 7
LOBE_DEPTH = 0.28
LOBE_PHASE = 0.9

# --- the dent, in metres from the undisturbed skin ---------------------------

# `damage.SCAR_DEPTH` is 0.20 m of real geometry. The painted bowl is shallower
# because a normal map fakes depth by tilt alone: at 0.12 m over a 0.40 m
# crater the steepest wall tilts about 23 degrees, which shades hard without
# the smeared silhouette a deeper fake gives at a grazing angle.
DENT_DEPTH = 0.12
LIP_HEIGHT = 0.012      # the splintered rim, the one part that IS proud
LIP_WIDTH = 0.11        # of `d`, either side of BOWL_EDGE
GROOVE = 0.006          # radial splinter grooves, peak to skin

# --- the colours, sRGB 0..255, converted before they are mixed ---------------

# Fresh oak torn open: the whole reason the albedo half exists.
#
# THIS IS PALER THAN IT LOOKS ON PAPER AND IT HAS TO BE. The topside it is
# painted against is `palette.OCHRE_STRAKE` (231, 193, 101) weathered down,
# and in the LINEAR floats Blender hands back from `image.pixels` that ochre
# already measures 0.51 to 0.64 luminance over the nine scar sites. A
# believable oak brown (218, 196, 152) measures 0.555 — the same luminance as
# the paint it is supposed to stand out of, which is exactly what the first
# cut of this shipped and why it did not read. Both ends of that comparison
# are named in the ledger.
SPLINTER_PALE = (242, 232, 206)
# Where the ball struck. Bruised and powder-burnt, darker than either.
SCAR_CORE = (84, 70, 54)
# How far toward CORE the centre goes, in `d`.
CORE_BURN = 0.22


# THE BAND THAT IS SPLINTERED WOOD IN EVERY SCAR, and the one the atlas is
# judged on. It starts where the powder burn at the impact point ends
# (`CORE_BURN`) and stops at the TIGHTEST the ragged outline ever pulls in
# (`1 - LOBE_DEPTH`), so every texel in it is painted at or near full strength
# whatever angle it lies at. Measuring the whole painted disc instead would
# average the dark core and the feathered fringe into the pale wood and report
# a scar that barely lightened anything, which is what the first cut did.
SPLINTER_BAND = (CORE_BURN, 1.0 - LOBE_DEPTH)


def srgb_to_linear(c) -> tuple:
    """The same conversion `frigate.palette` uses, repeated rather than
    imported so neither module owns the other; the equality is a test."""
    def one(v: float) -> float:
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(one(v) for v in c)


SPLINTER_PALE_LINEAR = srgb_to_linear(SPLINTER_PALE)
SCAR_CORE_LINEAR = srgb_to_linear(SCAR_CORE)


def paint_radius(crater_radius: float) -> float:
    """Crater rim to the outer edge of the splinter field, in metres."""
    return crater_radius * PAINT_RADIUS_FACTOR


SEAM_LOSS = 0.25    # of a painted disc a UV island seam may take


def scar_texel_floor(paint_radius: float, metres_per_texel: float) -> float:
    """The least a painted scar may cover, in texels: the disc its paint
    reaches, at the texel size of the hull it lands on, less `SEAM_LOSS`.
    On the frigate's smallest scar this is `checks.SCAR_TEXEL_FLOOR`'s
    120; a scar on a coarser atlas, or a smaller crater, asks for fewer."""
    import math

    disc = math.pi * (paint_radius / metres_per_texel) ** 2
    return (1.0 - SEAM_LOSS) * disc


def paint_diameter_texels(crater_radius: float, texels_per_metre: float) -> float:
    """How many texels the whole painted scar spans. The honest limit."""
    return 2.0 * paint_radius(crater_radius) * texels_per_metre


# --- the outline -------------------------------------------------------------


def edge(angle: float) -> float:
    """The outline radius at this angle, in units of `d`. In (0, 1].

    Deterministic and periodic: two lobe counts that share no factor, so the
    outline does not repeat around the circle and no scar comes out a flower.
    """
    a = (0.5 + 0.5 * math.sin(LOBE_COUNT * angle + LOBE_PHASE))
    b = (0.5 + 0.5 * math.sin(3 * angle - 2.1))
    return 1.0 - LOBE_DEPTH * (0.62 * a + 0.38 * b)


def _smoothstep(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3.0 - 2.0 * t)


def coverage(d: float, angle: float) -> float:
    """How much of this texel is scar rather than planking. 1 at the centre."""
    rim = edge(angle)
    if d >= rim:
        return 0.0
    if d <= CORE_EDGE:
        return 1.0
    return _smoothstep((rim - d) / max(rim - CORE_EDGE, 1e-9))


# --- the colour --------------------------------------------------------------


def paint_colour(d: float, angle: float) -> tuple:
    """The scar's own colour at this point, linear. Core to splinter."""
    t = _smoothstep(d / CORE_BURN)
    pale = tuple(
        c * (0.88 + 0.12 * (0.5 + 0.5 * math.sin(LOBE_COUNT * angle + 2.4)))
        for c in SPLINTER_PALE_LINEAR
    )
    return tuple(a + (b - a) * t for a, b in zip(SCAR_CORE_LINEAR, pale))


def blend_albedo(base, d: float, angle: float) -> tuple:
    """Mix the scar over the planking that was there. `base` is linear RGB."""
    w = coverage(d, angle)
    if w <= 0.0:
        return tuple(base)
    paint = paint_colour(d, angle)
    return tuple(min(1.0, max(0.0, b + (pcol - b) * w))
                 for b, pcol in zip(base, paint))


# --- the dent ----------------------------------------------------------------


def height(d: float, angle: float) -> float:
    """Metres from the undisturbed skin. Negative is into the planking."""
    if d >= 1.0:
        return 0.0
    out = 0.0
    if d < BOWL_EDGE:
        # A bowl that meets the skin tangentially at the rim rather than as a
        # crease: (1 - x^2) squared is flat-bottomed and zero-sloped at x = 1.
        x = d / BOWL_EDGE
        out -= DENT_DEPTH * (1.0 - x * x) ** 2
    # The splintered lip: a narrow ring of timber lifted at the crater rim.
    out += LIP_HEIGHT * math.exp(-((d - BOWL_EDGE) / LIP_WIDTH) ** 2)
    # Radial grooves. They fade out before the paint does, so the skin is
    # flat again outside the outline, and they fade IN away from the centre,
    # because a radial groove has no meaning at the point every radius
    # starts from -- at d = 0 the angle is undefined and a groove there would
    # be a spike on the deepest texel of the bowl.
    fade = _smoothstep((1.0 - d) / 0.25) * _smoothstep(d / CORE_EDGE)
    out += GROOVE * math.sin(LOBE_COUNT * angle + LOBE_PHASE) * fade
    return out


# --- tangent-space normals ---------------------------------------------------


def encode_normal(n) -> tuple:
    """Unit vector to the 0..1 triple a tangent-space normal map stores."""
    return (n[0] * 0.5 + 0.5, n[1] * 0.5 + 0.5, n[2] * 0.5 + 0.5)


def decode_normal(rgb) -> tuple:
    return (rgb[0] * 2.0 - 1.0, rgb[1] * 2.0 - 1.0, rgb[2] * 2.0 - 1.0)


def _normalize(v) -> tuple:
    length = math.sqrt(sum(c * c for c in v))
    if length < 1e-12:
        return (0.0, 0.0, 1.0)
    return tuple(c / length for c in v)


def detail_normal(slope_u: float, slope_v: float) -> tuple:
    """A height field's own normal: n = normalize(-dh/du, -dh/dv, 1).

    The slopes are metres of height per metre of surface, so they are taken
    across the texel's own world size and not across the texel.
    """
    return _normalize((-slope_u, -slope_v, 1.0))


def combine_normals(base, detail) -> tuple:
    """Lay a detail normal over a baked one. Partial-derivative blending.

    Both normals ARE height-field gradients, so the exact composition is to add
    the gradients and renormalise — which is what this is, written without
    dividing by a z that can be zero. Whiteout and overlay blends are
    approximations of it; this one is the thing itself, and it is why the
    hull's baked wood grain survives under the dent instead of being replaced.
    """
    bx, by, bz = base
    dx, dy, dz = detail
    return _normalize((bx * dz + dx * bz, by * dz + dy * bz, bz * dz))


# --- where the pattern is measured from --------------------------------------


def tangent_basis(normal) -> tuple:
    """Two unit vectors square to `normal` and to each other, deterministically.

    The scar's lobes are laid out in this frame, so it must come out the same
    on every bake or the atlas stops being reproducible — which the
    byte-identical-image guard in `frigate.export` would report as an exporter
    fault.
    """
    n = _normalize(normal)
    # Pick the world axis the normal leans on LEAST, so the cross product never
    # collapses. Smallest component, ties broken by index: no randomness.
    axis = min(range(3), key=lambda i: (abs(n[i]), i))
    seed = tuple(1.0 if i == axis else 0.0 for i in range(3))
    t1 = _normalize((n[1] * seed[2] - n[2] * seed[1],
                     n[2] * seed[0] - n[0] * seed[2],
                     n[0] * seed[1] - n[1] * seed[0]))
    t2 = _normalize((n[1] * t1[2] - n[2] * t1[1],
                     n[2] * t1[0] - n[0] * t1[2],
                     n[0] * t1[1] - n[1] * t1[0]))
    return t1, t2


def polar(point, centre, t1, t2) -> tuple:
    """(distance in metres, angle in the tangent frame) of a point on a scar."""
    v = tuple(a - b for a, b in zip(point, centre))
    u = sum(a * b for a, b in zip(v, t1))
    w = sum(a * b for a, b in zip(v, t2))
    return math.sqrt(sum(c * c for c in v)), math.atan2(w, u)


# --- UV rasterisation --------------------------------------------------------


def rasterize_triangle(uvs, width: int, height_px: int) -> list:
    """Every texel whose CENTRE lies in this UV triangle, with its barycentric.

    Returns [(x, y, (b0, b1, b2))]. Texel centres are at ((x + 0.5) / width,
    (y + 0.5) / height), which is Blender's own convention for `image.pixels`
    — row 0 is the BOTTOM of the image, so +y is +V and the green channel of a
    normal map points the way the V axis does.

    A degenerate triangle returns nothing rather than dividing by zero: the
    unwrap is smart-projected and a sliver at an island edge is normal.
    """
    (u0, v0), (u1, v1), (u2, v2) = uvs
    area = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)
    if abs(area) < 1e-14:
        return []
    lo_u, hi_u = min(u0, u1, u2), max(u0, u1, u2)
    lo_v, hi_v = min(v0, v1, v2), max(v0, v1, v2)
    x0 = max(0, int(math.floor(lo_u * width - 0.5)))
    x1 = min(width - 1, int(math.ceil(hi_u * width - 0.5)))
    y0 = max(0, int(math.floor(lo_v * height_px - 0.5)))
    y1 = min(height_px - 1, int(math.ceil(hi_v * height_px - 0.5)))
    out = []
    for y in range(y0, y1 + 1):
        pv = (y + 0.5) / height_px
        for x in range(x0, x1 + 1):
            pu = (x + 0.5) / width
            b1 = ((pu - u0) * (v2 - v0) - (u2 - u0) * (pv - v0)) / area
            b2 = ((u1 - u0) * (pv - v0) - (pu - u0) * (v1 - v0)) / area
            b0 = 1.0 - b1 - b2
            if b0 < -1e-9 or b1 < -1e-9 or b2 < -1e-9:
                continue
            out.append((x, y, (b0, b1, b2)))
    return out


def planking_grain(steps) -> float:
    """The planking's own TEXEL-TO-TEXEL grain over a scar's comparison
    ring: the mean of `steps` (distance, band of one texel, band of its
    neighbour) taken over the steps whose two texels lie in ONE livery band
    (`palette.livery_band`). A step from the black wale to the ochre strake
    is an edge of the paint scheme, not grain; counted, it made the grain
    of a ring that crosses wales laid between the rows (the maintainer's third
    ruling, C) 0.10..0.14 against 0.023..0.043 inside the bands. 0.0 with
    no step inside one band."""
    inside = [d for d, a, b in steps if a == b]
    return sum(inside) / len(inside) if inside else 0.0
