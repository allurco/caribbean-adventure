"""The texture budget: how big the atlases are, what they are encoded as, and
how the JPEG quality was CHOSEN. No bpy, no numpy.

WHY THIS MODULE EXISTS. The first texture pass shipped twelve lossless 2048
atlases: a 47.4 MB `.glb` for a 34,062-triangle asset, 46.6 MB of it texture.
The maintainer's ruling is 1024, albedo and roughness as JPEG, normals as PNG. Spec
section 8 says 2048 per family; that line is now stale and the override is
recorded in the ledger as a game-readiness decision.

NORMALS STAY PNG, AND THAT IS NOT A PREFERENCE. A normal map's value IS its
direction. JPEG's 8x8 DCT rings at a step edge, and a rung normal is not a
blurry picture, it is a surface pointing somewhere it does not point — visible
as shading error exactly where the detail is, which on this ship is the
figurehead's drapery and the stern frieze, the two things the whole high-to-low
bake pass was built for.

ONE ALBEDO ALSO STAYS PNG. The rigging's alpha cut is composited into the
albedo atlas's ALPHA channel, because a glTF material has nowhere else to carry
it. JPEG has no alpha channel at all, so `rope_iron_albedo` in JPEG would not
be a worse rope, it would be 741 flat tapes.

HOW THE QUALITY WAS MEASURED, NOT TASTED. The artefact that matters at a paint
boundary is RINGING: the truncated DCT overshoots a step and puts values
OUTSIDE anything the original line contained. Blur stays inside the range.
Blocking stays inside the range. Ringing does not — which makes it the one
artefact that cannot be confused with the asset's own procedural grain. So:

  1. Draw lines across the hardest edges in the atlas — the black wales against
     the ochre strakes, and the gunport edges.
  2. Encode the atlas at each quality, decode it, and take the worst excursion
     outside the original line's own range (`ring_overshoot`).
  3. Compare that against the strake's own grain (`peak_to_peak` of lines drawn
     INSIDE the flat paint). Ringing below the grain is indistinguishable from
     the texture that is supposed to be there; above it, it reads as a halo.

`SWEEP` and `GRAIN` below are the numbers that came back, and `JPEG_QUALITY` is
what shipped. `quality_faults` judges the shipped number against the sweep, so
the choice is re-checked on every test run instead of living in a commit
message.
"""

import math
from dataclasses import dataclass

# The maintainer's override of spec section 8. Halved from 2048 for game-readiness.
ATLAS_SIZE = 1024

# What the whole `.glb` has to come in under, and WHY THIS IS NOT THE MAINTAINER'S 8 MB.
#
# Halving both atlas dimensions quarters the texel count, so the ceiling is
# derived from the change itself rather than from the result: the 2.19 MB of
# mesh, indices and tangents that no texture decision can shrink, plus a
# quarter of the 44.9 MB of texture the 2048 pass carried, which is 11.2 MB.
# That gives 13.4 MB and the constant is rounded DOWN to 13, so the assertion
# is slightly stricter than the arithmetic that justifies it. Above it means
# an atlas did not shrink or a format quietly reverted — which is exactly what
# the metallic-roughness maps did until the mime check read them back.
#
# THE MAINTAINER'S 6-8 MB IS NOT MET AND THIS IS NOT A TUNING QUESTION. The pass lands
# at 11.9 MB. Four LOSSLESS 1024 normal maps of procedural noise are 5.2 MB on
# their own, the rope albedo has to stay PNG for its alpha cut at 1.1 MB, the
# four metallic-roughness maps are PNG because Blender composes them (see
# gltf.ROLE_MIME) at 2.6 MB, and the mesh is 2.2 MB. That is 11.1 MB before a
# single colour map is counted. 8 MB is unreachable while the normals are
# lossless, which was the other half of the ruling, and the levers all cost
# something the maintainer ruled on. The decision is the maintainer's.
#
# IT IS THE FRIGATE'S FIGURE, and it is now carried as her `Budget`'s
# `glb_ceiling`, verbatim: a ship with another mesh and another number of
# atlas sets derives her own with `glb_ceiling` below.
MAX_GLB_BYTES = 13_000_000

# THE FRIGATE'S FILE, MEASURED: `build/frigate.glb` as shipped at 1024, read
# by `frigate.gltf`'s layout (the image bufferViews summed, the index
# accessors' counts over three for every mesh the file stores once).
FRIGATE_GLB_BYTES = 12_002_512
FRIGATE_IMAGE_BYTES = 9_724_937     # her twelve images, four atlas sets
FRIGATE_UNIQUE_TRIS = 27_650        # over her 40 stored meshes
FRIGATE_SETS = 4

# What the file costs a stored triangle (everything that is not an image:
# positions, normals, tangents, UVs, indices, the JSON, padding) and an atlas
# set at 1024, at the frigate's rates. 82.37 bytes and 2,431,234 bytes.
MESH_BYTES_PER_TRI = (FRIGATE_GLB_BYTES - FRIGATE_IMAGE_BYTES) \
    / FRIGATE_UNIQUE_TRIS
SET_BYTES = FRIGATE_IMAGE_BYTES / FRIGATE_SETS


def glb_ceiling(unique_tris: int, sets: int) -> int:
    """A ship's `.glb` ceiling, derived the way the frigate's was: the mesh
    the file stores (its unique triangles at the frigate's bytes a triangle)
    plus one atlas set a material family (at the frigate's cost a set),
    rounded up to the MB. On the frigate's own figures it gives back her
    13,000,000."""
    raw = unique_tris * MESH_BYTES_PER_TRI + sets * SET_BYTES
    return math.ceil(raw / 1_000_000) * 1_000_000

PNG = "PNG"
JPEG = "JPEG"
_MIME = {PNG: "image/png", JPEG: "image/jpeg"}

# Kinds this module knows how to budget. Kept in step with texstats.KINDS,
# asserted in the tests rather than imported, so neither module owns the other.
KINDS = ("albedo", "normal", "roughness")


def image_format(kind: str, carries_alpha: bool) -> str:
    """What this atlas ships as. See the module docstring for both exceptions."""
    if kind not in KINDS:
        raise ValueError(f"unknown bake kind {kind!r}")
    if kind == "normal":
        return PNG
    # Only the ALBEDO is excused by alpha. A roughness atlas has no fourth
    # channel to lose, so a family that happens to carry an alpha cut must not
    # drag its roughness map back to lossless with it — which is exactly what
    # the first form of this function did, and it cost the rope family's
    # roughness map 1.6 MB for nothing.
    if kind == "albedo" and carries_alpha:
        return PNG
    return JPEG


def mime_of(fmt: str) -> str:
    if fmt not in _MIME:
        raise ValueError(f"unknown image format {fmt!r}")
    return _MIME[fmt]


# --- the artefact measure ----------------------------------------------------


def ring_overshoot(original, decoded) -> float:
    """How far a decoded line goes OUTSIDE the original line's own range.

    One line, drawn across one hard edge. The original crosses from the black
    wale to the ochre strake, so it holds values in [black, ochre] and nothing
    else; any decoded value beyond either end is ringing and nothing but
    ringing. This is why the measure is an excursion and not an error norm — an
    error norm cannot tell a softened edge, which looks fine, from a haloed
    one, which does not.
    """
    if len(original) != len(decoded):
        raise ValueError(
            f"the lines must be the same length: {len(original)} and {len(decoded)}"
        )
    if not original:
        raise ValueError("an empty line cannot be measured")
    lo, hi = min(original), max(original)
    return max(0.0, max(max(v - hi for v in decoded), max(lo - v for v in decoded)))


def line_rmse(original, decoded) -> float:
    """Plain error along the same line. Reported beside the overshoot because a
    line can ring very little and still be mush, and the pair says which."""
    if len(original) != len(decoded):
        raise ValueError(
            f"the lines must be the same length: {len(original)} and {len(decoded)}"
        )
    if not original:
        raise ValueError("an empty line cannot be measured")
    return (sum((a - b) ** 2 for a, b in zip(original, decoded)) / len(original)) ** 0.5


def peak_to_peak(line) -> float:
    """The swing of a line drawn INSIDE one flat colour: the paint's own grain.

    This is the threshold the ringing is judged against, and it is a property
    of this asset rather than a number out of the air. The strakes are not flat
    colour — every family carries procedural noise — so an artefact smaller
    than the noise is not visible as an artefact.
    """
    if not line:
        raise ValueError("an empty line cannot be measured")
    return max(line) - min(line)


@dataclass(frozen=True)
class EdgeSample:
    """One JPEG quality, measured across every hard-edge line in the atlas."""

    quality: int
    overshoot: float
    rmse: float


# --- what the measurement said -----------------------------------------------
#
# MEASURED, 2026-10-03, on the 1024 bake of `frigate_hull_timber_albedo` —
# the atlas that carries both of the hardest edges on the ship. BLENDER wrote
# the JPEGs, at each quality, from the same float buffer the lossless master
# came from, so the encoder measured is the encoder that ships.
#
# 128 lines of 16 texels were drawn across the 128 strongest luminance
# gradients in the atlas, 64 across each axis, each line spanning both ways
# from the edge at its centre. BOTH ENDS OF EVERY LINE NAMED: averaged over
# the 128, a line runs from RGB (67, 60, 49) to RGB (197, 166, 97) — the
# weathered black of the wales, cap band and gunport surrounds against the
# weathered ochre of the strakes, a luminance step of 0.420. Repeated with the
# sites restricted to one object's own texels, to answer the two edges by
# name rather than by hoping they were the strongest:
#
#   whole atlas    (67, 60, 49) -> (197, 166, 97)   onset Q90
#   Hull only      (74, 65, 52) -> (194, 160,  94)  onset Q90   the wales
#   Bulwarks only  (68, 63, 56) -> (176, 152,  97)  onset Q90   the gunports
#
# All three agree, which is the result that matters: there is no edge in this
# asset that goes first.
#
# GRAIN is the median peak-to-peak of 128 lines drawn INSIDE the flat ochre,
# clear of every edge: 0.03177, which is 8.1 levels out of 255. That is the
# ochre's own procedural noise, and ringing below it cannot be told from the
# texture that is supposed to be there.
#
#       Q   worst overshoot    p95     rmse     KB   over the grain?
#     100           0.00963  0.00357  0.00215   768   no
#      95           0.02701  0.01533  0.00674   387   no
#      90           0.05134  0.03414  0.01128   266   YES  <- onset
#      85           0.06991  0.04610  0.01420   208   YES
#      80           0.08135  0.04655  0.01665   175   YES
#      75           0.07037  0.05776  0.01927   152   YES
#      70           0.08607  0.06436  0.02147   137   YES
#      65           0.09133  0.06832  0.02337   125   YES
#      60           0.11599  0.06545  0.02528   115   YES
#      55           0.10623  0.07707  0.02680   107   YES
#      50           0.10590  0.08091  0.02783   101   YES
#
# The artefact first appears at Q90, where the worst halo is 0.051 — 1.6x the
# ochre's own grain and visible as a light fringe along the top of the wale.
# Q95 is the first quality clean of it, at 0.027, and that is what ships. The
# step from 95 to 90 would save about 120 KB an atlas across six atlases;
# 0.7 MB is not worth a halo on the one line of the paint scheme the reference
# is most specific about.

GRAIN = 0.03177
SWEEP = (
    EdgeSample(100, 0.00963, 0.00215),
    EdgeSample(95, 0.02701, 0.00674),
    EdgeSample(90, 0.05134, 0.01128),
    EdgeSample(85, 0.06991, 0.01420),
    EdgeSample(80, 0.08135, 0.01665),
    EdgeSample(75, 0.07037, 0.01927),
    EdgeSample(70, 0.08607, 0.02147),
    EdgeSample(65, 0.09133, 0.02337),
    EdgeSample(60, 0.11599, 0.02528),
    EdgeSample(55, 0.10623, 0.02680),
    EdgeSample(50, 0.10590, 0.02783),
)
JPEG_QUALITY = 95

# One full step of the sweep. The sweep steps in fives, so an onset is only
# located to within five, and a quality closer than that to the onset is
# inside the resolution of the measurement that placed it.
QUALITY_MARGIN = 5


def onset(samples, grain: float):
    """The HIGHEST quality at which the ringing already clears the grain.

    Highest, not lowest: quality falls as the number falls, so the first
    quality going DOWN the sweep that shows an artefact is where the cliff
    starts. Returns None if the sweep never reached it, which means the sweep
    did not go far enough to have chosen anything.
    """
    bad = [s.quality for s in samples if s.overshoot > grain]
    return max(bad) if bad else None


def quality_faults(quality: int, samples, grain: float,
                   margin: int = QUALITY_MARGIN) -> list[str]:
    """Every reason this is not a quality that was chosen by measuring."""
    out = []
    qualities = {s.quality for s in samples}
    if quality not in qualities:
        out.append(
            f"quality {quality} was never measured — the sweep covers "
            f"{sorted(qualities, reverse=True)}"
        )
    start = onset(samples, grain)
    if start is None:
        return out
    if quality <= start:
        out.append(
            f"quality {quality} is at or below the measured artefact onset of "
            f"{start} (grain {grain:.4f})"
        )
    elif quality - start < margin:
        out.append(
            f"quality {quality} is only {quality - start} above the measured "
            f"onset of {start}, inside the {margin}-step margin"
        )
    return out
