"""No committed `.blend` carries a local filesystem path.

The repo is public. A scene saved by the generator once held each texture's
absolute path and the file browser's remembered directory, both under the
saving machine's home folder. `frigate.blendsave.save_clean` now writes them
relative or empty, and uncompressed; `frigate.blendscan` reads the bytes back,
here for every scene under `build/` and in the town export before it keeps
a file.
"""

import glob
import os

import pytest

from frigate import blendscan

BUILD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
BLENDS = sorted(glob.glob(os.path.join(BUILD, "*.blend")))
BLEND_HEADER = b"BLENDER17-01v0502"


@pytest.mark.parametrize("raw", [
    b"\0/Users/someone/code/x/tex.jpg\0",
    b"\0/home/someone/tex.png\0",
    b"//textures/a.jpg\0venture/.claude/worktrees/agent-1/boats/a.jpg\0",
    b"\0\0Users/someone\0",                   # a home dir's tail, slash lost
    b"\0/tmp/\0",
    b"\0/private/var/x\0",
    b"\0/var/folders/ab/T/\0",
    b"\0/Volumes/Disk/x.blend\0",
    b"\0C:\\Users\\someone\\x.blend\0",
    b"\0C:/Users/x\0",
    b"\0e:\\work\\x.blend\0",
    b"\0D:/Documents and Settings/x\0",
    b"\0/opt/render/out\0",
    b"\0/root/scenes/x.blend\0",
    b"\0/mnt/c/Users/x\0",
    b"\0/usr/local/share/tex.png\0",
    b"\0/run/user/1000/x\0",
    b"\0/Library/Caches/x\0",
    b"\0/Applications/Blender.app/x\0",
    b"\0~/Desktop/tex.png\0",
    b"\0\\\\server\\share\\tex.png\0",
    # Blender's bundled assets, but from an install under a home directory.
    b"\0/Users/someone/Applications/Blender.app/Contents/Resources/5.2/datafiles/assets/b.blend\0",
    b"\0/home/someone/blender-5.2/5.2/datafiles/assets/brushes/b.blend\0",
])
def test_it_finds_a_local_path(raw):
    assert blendscan.local_paths(raw)


@pytest.mark.parametrize("raw", [
    b"\0//textures/frigate_canvas_albedo.jpg\0xxxxxxxx\0",
    b"\0//\0",
    b"\0Hull_Users/rig\0",                     # a name that merely contains it
    b"\0Save As Blender File\0",
    b"\x3f\x80Q:/\x00\x00",                    # a drive-like run inside float data
    b"\x3f~/ab\x00",                             # a tilde run inside data
    b"\x3f\\\\ab\\cd\x00",                       # backslashes inside data
    # Blender's own bundled brushes, which a fresh scene's paint tools name.
    b"\0/Applications/Blender.app/Contents/Resources/5.2/datafiles/assets/brushes/"
    b"essentials_brushes-gp_draw.blend\0",
    b"\0/usr/share/blender/5.2/datafiles/assets/brushes/essentials_brushes-gp_draw.blend\0",
    b"\0C:\\Program Files\\Blender Foundation\\Blender 5.2\\5.2\\datafiles\\assets\\b.blend\0",
])
def test_it_passes_a_clean_string(raw):
    assert blendscan.local_paths(raw) == []


def test_it_hides_the_user_name_in_a_report():
    assert blendscan.redact("/Users/someone/code/a.jpg") == "/Users/<user>/code/a.jpg"
    assert blendscan.redact("C:\\Users\\someone\\a") == "C:\\Users\\<user>\\a"


def test_a_clean_uncompressed_blend_has_no_faults():
    assert blendscan.blend_faults(BLEND_HEADER + b"\0Walls\0//textures\0") == []


@pytest.mark.parametrize("path", [b"/Users/someone", b"/home/someone/x", b"/private/var/x",
                                  b"/tmp/", b"C:\\Users\\x", b"C:/Users/x"])
def test_each_kind_of_local_path_is_a_fault(path):
    found = blendscan.blend_faults(BLEND_HEADER + b"\0Save As Blender File\0" + path + b"\0")
    assert any("local path" in f for f in found)


def test_a_compressed_blend_is_refused_as_unreadable():
    for magic in (b"\x28\xb5\x2f\xfd", b"\x1f\x8b"):
        assert any("compressed" in f for f in blendscan.blend_faults(magic + b"\0" * 32))


def test_bytes_that_are_not_a_blend_are_refused():
    assert any("not a .blend" in f for f in blendscan.blend_faults(b"glTF\x02\0\0\0"))


def test_there_are_scenes_to_check():
    assert BLENDS, f"no .blend under {BUILD}"


@pytest.mark.parametrize("path", BLENDS, ids=os.path.basename)
def test_a_committed_scene_is_uncompressed_and_holds_no_local_path(path):
    with open(path, "rb") as f:
        faults = blendscan.blend_faults(f.read())
    assert not faults, (
        f"{os.path.basename(path)} is not fit to commit; re-save it through "
        f"frigate.blendsave.save_clean: {faults[:5]}")
