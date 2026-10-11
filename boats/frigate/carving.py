"""Which carving stands on the stem head, and how to read it. No bpy.

The head rails die into the figurehead's own bounding box, so the carving is
a STRUCTURAL landmark of the head and not a decoration hung on it afterwards.
That is why this dispatcher exists rather than `head.py` importing one ship's
figure directly: a module that can only find Minerva can only build a frigate.

Each ship names its carving in `p.figurehead`. An unknown name raises here,
loudly, rather than falling back to the frigate's goddess — a galleon that
silently wore Minerva would pass every check in the project.

The two carvings and why they are different are argued in their own modules:
`profiles` carries Minerva (the frigate's, after Tornstrom's figure for the
Swedish frigate *Minerva* of 1783) and `lion` carries the galleon's crowned
lion rampant.
"""

from . import lion, profiles
from .params import FrigateParams

Point = tuple[float, float, float]


def _minerva_ring_groups(p: FrigateParams) -> list[list[list[Point]]]:
    return [
        profiles.figure_body_rings(p),
        profiles.figure_head_rings(p),
        profiles.figure_arm_rings(p, 1.0),
        profiles.figure_arm_rings(p, -1.0),
        profiles.figure_shield(p)["rings"],
        profiles.figure_spear_rings(p),
        profiles.figure_drapery_rings(p),
    ]


def _minerva_boxes(p: FrigateParams) -> list[tuple[Point, Point]]:
    return [profiles.figure_foot_box(p)]


# (ring groups, solid boxes, every point, triangle count, height). `all_points`
# is NOT derived from the other two on purpose: the frigate's is frozen in
# `tests/test_frigate_frozen.py` in its own emission order, and rebuilding it
# "equivalently" here is exactly the move that digest exists to catch.
_CARVINGS = {
    "minerva": (_minerva_ring_groups, _minerva_boxes, profiles.figure_all_points,
                profiles.figure_triangles, profiles.figure_height),
    "lion": (lion.ring_groups, lion.boxes, lion.all_points,
             lion.triangles, lion.height),
}


def _pick(p: FrigateParams):
    try:
        return _CARVINGS[p.figurehead]
    except KeyError:
        raise KeyError(
            f"no carving named {p.figurehead!r}; this fleet carves "
            f"{sorted(_CARVINGS)}. A ship that names a carving nobody has "
            f"cut does not quietly get the frigate's."
        ) from None


def names() -> tuple[str, ...]:
    return tuple(sorted(_CARVINGS))


def ring_groups(p: FrigateParams) -> list[list[list[Point]]]:
    """Every lofted part of the carving, NOT counting the trailboards."""
    return _pick(p)[0](p)


def boxes(p: FrigateParams) -> list[tuple[Point, Point]]:
    """Every solid box of the carving — Minerva's bare foot, and nothing else."""
    return _pick(p)[1](p)


def all_points(p: FrigateParams) -> list[Point]:
    """Every vertex of the carving INCLUDING both trailboards."""
    return _pick(p)[2](p)


def triangles(p: FrigateParams) -> int:
    return _pick(p)[3](p)


def height(p: FrigateParams) -> float:
    """The carving's own principal span, rump-to-nose or heel-to-crown."""
    return _pick(p)[4](p)


def bounds(p: FrigateParams) -> tuple[Point, Point]:
    """The carving's bounding box. The upper head rail dies inside it."""
    pts = all_points(p)
    return (tuple(min(pt[k] for pt in pts) for k in range(3)),
            tuple(max(pt[k] for pt in pts) for k in range(3)))
