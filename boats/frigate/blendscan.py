"""Read a saved `.blend` as bytes and find any local filesystem path in it.

Pure: no bpy. The committed scenes under `build/` are public, so none of them
may carry a path off the machine that saved it: a texture's absolute
filepath, the file browser's remembered directory, a render output folder.

The scenes are saved UNCOMPRESSED (`blendsave.save_clean`), so their bytes
are the scan's input as they are, and a plain grep over the file finds what
this finds. A compressed `.blend` is refused, not decompressed: it is not
what the savers write, and it could not be audited without a decoder.

WHY THE SCAN ALSO LOOKS FOR A HOME DIRECTORY WITHOUT ITS SLASH. Blender
writes each fixed-size string buffer whole (an image's filepath is 1,024
bytes), NUL and all, so a short path written over a long one leaves the long
one's tail after the NUL: `//textures/a.jpg\\0<the rest of the old path>`.
A tail is caught only where it still names something recognisable: a home
directory whose cut fell at `Users/` or `home/`, or a worktree path. A cut
anywhere else leaves an ordinary-looking fragment this cannot tell from
data, which is why `blendsave.save_clean` fills every buffer before writing
it, so no tail is saved at all.
"""

import re

BLEND_MAGIC = b"BLENDER"
COMPRESSED_MAGIC = {b"\x28\xb5\x2f\xfd": "zstd", b"\x1f\x8b": "gzip"}

# Each pattern names the start of a local path; the match runs on over the
# printable bytes that follow, so a report shows the whole string.
_TAIL = rb"[\x21-\x7e]*"
# Where a path may start a string: after a NUL, or as the first bytes. The
# short shapes (a drive letter, `~/`, a UNC share) are matched only there, so
# a stray run of bytes inside mesh data is not taken for one.
_AT_START = rb"(?:(?<=\x00)|^)"
LOCAL_PATH = re.compile(
    rb"(?:"
    rb"(?<![A-Za-z0-9_.-])(?:Users|home)/[A-Za-z0-9._-]+"  # a home dir, slash or not
    rb"|/Users/|/home/|/root/|/run/user/"                  # home and session dirs
    rb"|/Volumes/|/mnt/|/opt/|/usr/|/Library/|/Applications/"  # disks, installs
    rb"|/private/|/tmp/|/var/folders/"                     # macOS and Unix temp dirs
    rb"|" + _AT_START + rb"[A-Za-z]:[\\/][\x20-\x7e]{2,}"   # a Windows drive
    rb"|" + _AT_START + rb"\\\\[A-Za-z0-9._-]+\\[\x20-\x7e]+"  # a UNC share
    rb"|" + _AT_START + rb"~/[\x20-\x7e]+"                  # a home dir by tilde
    rb"|\.claude/worktrees"                                # an agent's worktree
    rb")" + _TAIL
)


# Blender's own bundled assets (the Essentials brushes a fresh scene's paint
# tools point at), named by the install's absolute path: the same on every
# machine with Blender in its usual place, so not a leak. One installed under
# a home directory still names the user, and is still reported.
_BLENDER_BUNDLED = re.compile(rb"[\\/]datafiles[\\/]assets[\\/]")
_UNDER_HOME = re.compile(rb"(?:Users|home)[\\/]|^~/")


def _is_blender_bundled(path: bytes) -> bool:
    return bool(_BLENDER_BUNDLED.search(path)) and not _UNDER_HOME.search(path)


def local_paths(raw: bytes) -> list[str]:
    """Every local path string in an uncompressed `.blend`, in file order."""
    return [m.group(0).decode("ascii", "replace") for m in LOCAL_PATH.finditer(raw)
            if not _is_blender_bundled(m.group(0))]


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
