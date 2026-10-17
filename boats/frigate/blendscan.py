"""Read a saved `.blend` as bytes and find any local filesystem path in it.

Pure: no bpy. The committed scenes under `build/` are public, so none of them
may carry a path off the machine that saved it: a texture's absolute
filepath, the file browser's remembered directory, a render output folder.

The scenes are saved UNCOMPRESSED (`blendsave.save_clean`), so their bytes
are the scan's input as they are, and a plain grep over the file finds what
this finds. A compressed `.blend` is refused, not decompressed: it is not
what the savers write, and it could not be audited without a decoder.

WHY THE SCAN LOOKS FOR FRAGMENTS, NOT ONLY WHOLE PATHS. Blender writes each
fixed-size string buffer whole (an image's filepath is 1,024 bytes), NUL and
all, so a short path written over a long one leaves the long one's tail after
the NUL: `//textures/a.jpg\\0<the rest of the old absolute path>`. A home
directory with its leading slash cut off, or the tail of a worktree path, is
still a leak, so both are patterns here. `blendsave.save_clean` is the writer
that leaves no such tail.
"""

import re

BLEND_MAGIC = b"BLENDER"
COMPRESSED_MAGIC = {b"\x28\xb5\x2f\xfd": "zstd", b"\x1f\x8b": "gzip"}

# Each pattern names the start of a local path; the match runs on over the
# printable bytes that follow, so a report shows the whole string.
_TAIL = rb"[\x21-\x7e]*"
LOCAL_PATH = re.compile(
    rb"(?:"
    rb"(?<![A-Za-z0-9_.-])(?:Users|home)/[A-Za-z0-9._-]+"  # a home dir, slash or not
    rb"|/Users/|/home/|/Volumes/"                          # macOS, Linux, mounted disks
    rb"|/private/|/tmp/|/var/folders/"                     # macOS and Unix temp dirs
    # A Windows drive at the start of a string (after a NUL, or the first
    # bytes) that goes on as a path; a stray letter, colon and slash inside
    # mesh data is not one.
    rb"|(?:(?<=\x00)|^)[A-Za-z]:[\\/][\x20-\x7e]{2,}"
    rb"|\.claude/worktrees"                                # an agent's worktree
    rb")" + _TAIL
)


def local_paths(raw: bytes) -> list[str]:
    """Every local path string in an uncompressed `.blend`, in file order."""
    return [m.group(0).decode("ascii", "replace") for m in LOCAL_PATH.finditer(raw)]


def redact(path: str) -> str:
    """The path with its user name hidden, for a report that may be shared."""
    return re.sub(r"(Users|home)([/\\])[^/\\]+", r"\1\2<user>", path)


def blend_faults(data: bytes) -> list[str]:
    """Why these `.blend` bytes are not fit to commit; empty when they are."""
    for magic, name in COMPRESSED_MAGIC.items():
        if data.startswith(magic):
            return [f"the .blend is {name}-compressed, so it cannot be checked; "
                    "save it uncompressed (blendsave.save_clean)"]
    if not data.startswith(BLEND_MAGIC):
        return ["the bytes are not a .blend"]
    found = sorted({redact(p) for p in local_paths(data)})
    return [f"it carries the local path \"{p[:120]}\"" for p in found]
