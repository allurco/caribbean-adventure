"""Emit the ship's head. Spec section 6, immediately after the rails.

This module only EMITS. Every coordinate it bridges comes from `frigate.head`,
which is bpy-free and under plain pytest, so the curve that matters — the one
fair line from the bulwark cap, down over the bow, out along the trailboard
and into Minerva — is judged off-Blender and can be reused by the galleon
without this file coming with it.

Two objects, four on a head form that asks for a beakhead deck, because
they are different things and the joints table should be able to rule on
them separately:

- `Headrails` — the fore-and-aft structure of the head: two rails a side, the
  timbers framed between them, and the knee that carries the lot.
- `Beakhead` — the athwartships bulkhead closing the forecastle, abaft it all.
- `Beakhead_Deck` — on a head form that asks for it (the galleon's), the
  frame timbers of the flight of platforms forward of the stem between the
  upper head rails: ledges, head ledges and the step risers.
- `Beakhead_Grating` — the same flight's floors, alpha-masked grating cards
  in a material family of their own.
"""

import bmesh
import bpy

from . import head, prims
from .params import FrigateParams


def _headrails(bm, p: FrigateParams) -> None:
    for sign in (1.0, -1.0):
        for rings in (head.lower_rail_rings(p, sign), head.upper_rail_rings(p, sign)):
            prims.bridge(bm, [[bm.verts.new(pt) for pt in ring] for ring in rings])
        for lo, hi in head.head_timber_boxes(p, sign):
            prims.box(bm, lo, hi)
    # The knee is a single centreline fin, so it is built once, not per side.
    prims.bridge(bm, [[bm.verts.new(pt) for pt in ring]
                      for ring in head.knee_rings(p)])


def _beakhead(bm, p: FrigateParams) -> None:
    prims.box(bm, *head.beakhead_wall(p))
    prims.box(bm, *head.beakhead_cap(p))


def _beakhead_deck(bm, p: FrigateParams) -> None:
    for rings in head.beakhead_deck_timbers(p):
        prims.bridge(bm, [[bm.verts.new(pt) for pt in ring] for ring in rings])


def _beakhead_grating(bm, p: FrigateParams) -> None:
    # One quad per card. A card is a single sheet: its family's material is
    # double-sided and its holes are the material's alpha, not geometry.
    for quad in head.beakhead_grating_cards(p):
        bm.faces.new([bm.verts.new(pt) for pt in quad])


def build_head(p: FrigateParams) -> list[bpy.types.Object]:
    p.validate()
    built = []
    # Flat shading, like the carving it runs into. The rails are moulded
    # timbers with real arrises; smoothing would average the outer face into
    # the underside and lose the one highlight that reads the sweep of the
    # head from a distance.
    parts = [("Headrails", _headrails), ("Beakhead", _beakhead)]
    # Only a head form that asks for a beakhead deck gets one. The frigate's
    # does not, so her head is the same two objects it always was.
    if p.head_form.beakhead_deck:
        parts += [("Beakhead_Deck", _beakhead_deck),
                  ("Beakhead_Grating", _beakhead_grating)]
    for name, fn in parts:
        bm = bmesh.new()
        fn(bm, p)
        # The grating's cards are isolated quads wound face-up by
        # `head.beakhead_grating_cards`; recalculating would flip some.
        built.append(prims.finish(bm, name, smooth=False,
                                  recalc=name != "Beakhead_Grating"))
    return built
