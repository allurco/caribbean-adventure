"""Export every town piece from a fresh Blender, headless.

    /path/to/Blender -b --factory-startup --python boats/town/run.py

Clears the factory scene, then runs `export.export_piece` for each piece and
prints what it read back off the file. Raises, and Blender exits non-zero,
if a file breaks its contract.
"""

import json
import os
import sys

BOATS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BOATS_DIR not in sys.path:
    sys.path.insert(0, BOATS_DIR)

import bpy  # noqa: E402

from town import export  # noqa: E402
from town.params import TavernParams  # noqa: E402

PIECES = (TavernParams(),)


def main() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for piece in PIECES:
        found = export.export_piece(piece)
        print("TOWN_EXPORT " + json.dumps({k: v for k, v in found.items()
                                            if k not in ("anchors",)}, default=str))
        print("TOWN_ANCHORS " + json.dumps(found["anchors"]))


try:
    main()
except Exception:  # Blender's --python swallows the exit status otherwise
    import traceback
    traceback.print_exc()
    sys.exit(1)
