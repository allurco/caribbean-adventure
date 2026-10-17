"""Save the scene as a `.blend` that holds no path off the saving machine.

The `.blend`s under `build/` are committed to a public repo. Saved plainly
they carried three kinds of local path, each now written clean for the save
and put back after it, so the live session is left as it was:

- every image's filepath, absolute into the build's `textures/` folder: made
  relative to the folder the file will live in (`//textures/...`);
- the file browser's remembered directory, which Blender's default Shading
  workspace keeps (its home folder): emptied;
- the render output folder, Blender's default `/tmp/`: `//`.

BLENDER WRITES A STRING BUFFER WHOLE. An image's filepath is a fixed 1,024
bytes in the file, and setting a shorter value only moves the NUL, so the old
absolute path's tail would still be saved after it. Each buffer is first
filled to its length with a harmless character, then given its value.

The file is saved UNCOMPRESSED, so `frigate.blendscan` (the pure check that
reads the saved bytes back) and a plain grep can read it as it is. Git
compresses what it stores anyway, and deltas uncompressed files better.
"""

import os

import bpy

FILLER = "x" * 2048  # longer than any of the buffers; Blender cuts it to fit


def _overwrite(owner, prop: str, value) -> None:
    filler = FILLER.encode() if isinstance(value, bytes) else FILLER
    setattr(owner, prop, filler)
    setattr(owner, prop, value)


def _relative_to(blend_dir: str, filepath: str) -> str:
    if not filepath or filepath.startswith("//"):
        return filepath
    absolute = os.path.normpath(bpy.path.abspath(filepath))
    try:
        rel = os.path.relpath(absolute, blend_dir)
    except ValueError:  # another drive: no relative path; keep the file name
        rel = os.path.basename(absolute)
    return "//" + rel.replace(os.sep, "/")


def _file_browsers():
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params is not None:
                    yield space.params


def save_clean(path: str, home_dir: str | None = None) -> str:
    """Save a copy of the scene at `path`, uncompressed, with no local path in it.

    `home_dir` is the folder the file will be kept in, when it is saved to a
    staging path first and moved there after: image paths are made relative
    to it. By default, the folder of `path`.
    """
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    blend_dir = os.path.abspath(home_dir or os.path.dirname(os.path.abspath(path)))
    undo = []
    try:
        # Each value is noted before it is touched, so a fault part-way puts
        # back whatever was scrubbed so far.
        for img in bpy.data.images:
            if img.filepath_raw:
                undo.append((img, "filepath_raw", img.filepath_raw))
                _overwrite(img, "filepath_raw", _relative_to(blend_dir, img.filepath_raw))
        for scene in bpy.data.scenes:
            undo.append((scene.render, "filepath", scene.render.filepath))
            _overwrite(scene.render, "filepath", "//")
        for params in _file_browsers():
            undo.append((params, "directory", params.directory))
            _overwrite(params, "directory", b"")
        bpy.ops.wm.save_as_mainfile(filepath=path, copy=True, compress=False,
                                    relative_remap=False)
    finally:
        for owner, prop, value in reversed(undo):
            setattr(owner, prop, value)
    return path
