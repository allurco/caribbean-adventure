"""The order a town piece's files are written in. Pure -- imports no bpy.

Both files are written to staging paths under `build/` (git-ignored) and
checked there: the `.glb` read back as bytes against its contract, the
`.blend` read back for local paths. Only when both pass are they moved where
the game (`public/town/`) and the repo (`build/town_*.blend`) keep them, so
an export that fails leaves the committed files as they were. A staged
`.glb` that fails stays in `build/` to be looked at.

`export.export_piece` injects the bpy writers and the checks.
"""

import os


def publish_piece(glb_path: str, blend_path: str, staging_dir: str,
                  write_glb, verify, write_blend, check_blend) -> dict:
    """Write, check, then move. Raises RuntimeError, files untouched, on any fault.

    `write_glb(path)` and `write_blend(path)` write a file; `verify(path)`
    returns what it measured with its `faults`; `check_blend(bytes)` returns
    the `.blend`'s faults.
    """
    os.makedirs(staging_dir, exist_ok=True)
    staged_glb = os.path.join(staging_dir, "staging_" + os.path.basename(glb_path))
    staged_blend = os.path.join(staging_dir, "staging_" + os.path.basename(blend_path))
    write_glb(staged_glb)
    found = verify(staged_glb)
    if found["faults"]:
        raise RuntimeError("the exported piece breaks its contract: " + "; ".join(found["faults"]))
    write_blend(staged_blend)
    with open(staged_blend, "rb") as handle:
        blend_faults = check_blend(handle.read())
    if blend_faults:
        os.remove(staged_blend)
        raise RuntimeError("the .blend is not fit to commit: " + "; ".join(blend_faults))
    os.makedirs(os.path.dirname(glb_path), exist_ok=True)
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    os.replace(staged_glb, glb_path)
    os.replace(staged_blend, blend_path)
    return {**found, "path": glb_path, "blend": blend_path}
