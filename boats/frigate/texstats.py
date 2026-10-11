"""Is a baked texture actually a texture, or a blank the exporter will ship? No bpy.

THE FAILURE THIS EXISTS TO CATCH, in the project's own Review Focus words:
`export_scene` succeeds on a material whose image is still blank, shipping a
silently untextured `.glb` that looks correct in Blender — because in Blender
the procedural node graph is still there doing the work, and only the EXPORT
sees the empty image. A green export of empty textures is the worst possible
outcome of the pass, so the verdict is taken here, on numbers, and the export
is refused unless it comes back clean.

HOW BLANKNESS IS MADE MEASURABLE. Every bake target is filled with a SENTINEL
colour before the bake runs and the bake is told not to clear it. Magenta is a
colour none of the four node graphs can produce: no family mixes toward it, and
a normal or roughness bake cannot reach it at all. So after the bake, a texel
still holding the sentinel is a texel nothing was written to, which turns two
questions that are otherwise guesswork into counts — did the bake write
anything, and over the part it wrote, is there any variation at all.

WHY EACH KIND HAS ITS OWN LIVE CHANNELS. A normal map's blue channel is close
to 1.0 over every flat face on the ship, legitimately; its detail lives in red
and green. A roughness bake is greyscale. Judging all three kinds on all four
channels would either pass a flat normal map or condemn a correct one.
"""

from dataclasses import dataclass

# The fill every bake target carries before the bake, and must not still carry
# after it. Not black: a correct albedo bake of the black wales IS black, and a
# guard that treats black as empty condemns the one thing it most wants to see.
SENTINEL = (1.0, 0.0, 1.0, 1.0)

KINDS = ("albedo", "normal", "roughness")

# Which channels carry the signal, per kind. See the module docstring.
LIVE_CHANNELS = {"albedo": (0, 1, 2), "normal": (0, 1), "roughness": (0,)}

# A bake that covered a tenth of its atlas has not failed — a family with few,
# small islands legitimately packs loose — but one that covered a thousandth
# has. This separates "nothing baked" from "packed loosely".
MIN_COVERAGE = 0.05

# Over the COVERED texels only. A flat fill has zero of all three.
MIN_RANGE = 0.04          # hi - lo
MIN_STD = 0.004
MAX_MODAL_SHARE = 0.985   # share of covered texels in one histogram bin


@dataclass(frozen=True)
class ChannelStats:
    """One channel of a baked image, over its COVERED texels only."""

    lo: float
    hi: float
    mean: float
    std: float
    modal_share: float


@dataclass(frozen=True)
class TextureStats:
    name: str
    kind: str
    width: int
    height: int
    covered: int
    total: int
    channels: tuple[ChannelStats, ...]

    @property
    def coverage(self) -> float:
        return self.covered / self.total if self.total else 0.0


def faults(s: TextureStats, size: int) -> list[str]:
    """Every reason this image is not an acceptable bake. Empty means it is.

    Returns reasons rather than a bool so a failure says WHICH texture and WHAT
    about it, which is the difference between a check you can act on and a red
    light you end up deleting.
    """
    out = []
    if s.kind not in KINDS:
        out.append(f"{s.name}: unknown bake kind {s.kind!r}")
        return out
    if (s.width, s.height) != (size, size):
        out.append(f"{s.name}: is {s.width}x{s.height}, not {size}x{size}")
    if s.total <= 0:
        out.append(f"{s.name}: has no texels at all")
        return out
    if s.covered == 0:
        out.append(f"{s.name}: NOTHING WAS BAKED — every texel is still the sentinel")
        return out
    if s.coverage < MIN_COVERAGE:
        out.append(
            f"{s.name}: only {s.coverage:.3%} of the atlas was baked, "
            f"under the {MIN_COVERAGE:.0%} floor"
        )
    live = LIVE_CHANNELS[s.kind]
    if max(live) >= len(s.channels):
        out.append(f"{s.name}: has {len(s.channels)} channels, needs {max(live) + 1}")
        return out
    for i in live:
        c = s.channels[i]
        if c.hi - c.lo < MIN_RANGE:
            out.append(
                f"{s.name}: channel {i} is FLAT — the whole bake lies between "
                f"{c.lo:.4f} and {c.hi:.4f}"
            )
        if c.std < MIN_STD:
            out.append(f"{s.name}: channel {i} has no variation (std {c.std:.5f})")
        if c.modal_share > MAX_MODAL_SHARE:
            out.append(
                f"{s.name}: channel {i} is {c.modal_share:.2%} one single value"
            )
    return out


def verdict(stats: list[TextureStats], size: int) -> list[str]:
    """Every fault across a whole texture set, with the set's own completeness.

    A set missing its normal map is as untextured, in the places that matter,
    as a set whose normal map is blank.
    """
    out = []
    for kind in KINDS:
        if not any(s.kind == kind for s in stats):
            out.append(f"the set has no {kind} bake at all")
    for s in stats:
        out.extend(faults(s, size))
    return out


def background_fill(kind: str, means: tuple[float, float, float]) -> tuple:
    """What the UNUSED part of an atlas should be left holding once measured.

    Not the sentinel. The sentinel's whole job is to be a colour the bake
    cannot produce, which makes it a colour that SCREAMS if a renderer ever
    samples it — and a renderer does, at low mip levels, where a 2048 atlas
    with 20% magenta in it averages magenta into every edge texel on the ship.

    So the sentinel is measured and then painted out: a normal map's unused
    space becomes flat tangent space, and a colour or roughness map's becomes
    the mean of what WAS baked, which is the value that disturbs a mip chain
    least. The order matters and is the point — measure, then fill. Filling
    first would erase the evidence the measurement is taken on.
    """
    if kind not in KINDS:
        raise ValueError(f"unknown bake kind {kind!r}")
    if kind == "normal":
        return (0.5, 0.5, 1.0, 1.0)
    return (means[0], means[1], means[2], 1.0)
