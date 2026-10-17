"""What a `.blend` must not carry into a public repo. Pure -- imports no bpy.

Blender writes the paths it remembers into the file: the file browser's last
directory (the user's home, next to "Save As Blender File"), the render
output (`/tmp/` by default), and any library or image path. The town export
saves uncompressed, so the bytes can be read here, and refuses to keep a
`.blend` that names a local path (`export.export_piece`).
"""

# Prefixes of a path on someone's machine, on macOS, Linux and Windows.
LOCAL_PATH_MARKERS = (b"/Users/", b"/home/", b"/private/", b"/tmp/", b"C:\\", b"C:/")

_BLEND_MAGIC = b"BLENDER"
_COMPRESSED = {b"\x28\xb5\x2f\xfd": "zstd", b"\x1f\x8b": "gzip"}


def local_path_faults(data: bytes) -> list:
    """Every local path the `.blend` bytes carry, or why they cannot be read."""
    for magic, name in _COMPRESSED.items():
        if data.startswith(magic):
            return [f"the .blend is {name}-compressed, so it cannot be checked; save it uncompressed"]
    if not data.startswith(_BLEND_MAGIC):
        return ["the bytes are not a .blend"]
    out = []
    for marker in LOCAL_PATH_MARKERS:
        at = data.find(marker)
        if at >= 0:
            end = data.find(b"\0", at)
            shown = data[at:end if 0 <= end - at <= 80 else at + 80]
            out.append(f"it carries the local path \"{shown.decode('latin-1')}\"")
    return out
