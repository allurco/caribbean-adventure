"""The tracked `.blend` carries no local path (the repo is public).

Blender writes the paths it remembers into a `.blend`: the file browser's
last directory, the render output (`/tmp/` by default), library and image
paths. `blendfile.local_path_faults` reads the bytes and names each one; the
town export refuses to keep a `.blend` it finds one in, and the committed
file is held to it here.
"""

import os

import pytest

from town import blendfile

BLEND_HEADER = b"BLENDER17-01v0502"

COMMITTED = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "build", "town_tavern.blend")


def test_a_clean_uncompressed_blend_has_no_faults():
    assert blendfile.local_path_faults(BLEND_HEADER + b"\0Walls\0//textures\0") == []


@pytest.mark.parametrize("path", [b"/Users/someone", b"/home/someone/x", b"/private/var/x",
                                  b"/tmp/", b"C:\\Users\\x", b"C:/Users/x"])
def test_each_kind_of_local_path_is_named(path):
    found = blendfile.local_path_faults(BLEND_HEADER + b"\0Save As Blender File\0" + path + b"\0")
    assert found
    assert any(path.decode() in f for f in found)


def test_a_compressed_blend_is_refused_as_unreadable():
    zstd = b"\x28\xb5\x2f\xfd" + b"\0" * 32
    gzip = b"\x1f\x8b" + b"\0" * 32
    for data in (zstd, gzip):
        assert any("compressed" in f for f in blendfile.local_path_faults(data))


def test_bytes_that_are_not_a_blend_are_refused():
    assert any("not a .blend" in f for f in blendfile.local_path_faults(b"glTF\x02\0\0\0"))


def test_the_committed_tavern_blend_is_clean():
    with open(COMMITTED, "rb") as handle:
        assert blendfile.local_path_faults(handle.read()) == []
