"""A failing export never leaves a bad file in the tree.

`publish.publish_piece` writes the `.glb` and the `.blend` to staging paths
under `build/staging/`, checks both, and only then moves them where the game and
the repo keep them. The writers and checks are injected, so the order is
tested here without Blender.
"""

import os
import shutil
import subprocess

import pytest

from town import publish


def _paths(tmp_path):
    return dict(glb=str(tmp_path / "public" / "tavern.glb"),
                blend=str(tmp_path / "build" / "town_tavern.blend"),
                staging=str(tmp_path / "build"))


def _run(tmp_path, glb_faults=(), blend_faults=(), calls=None):
    calls = [] if calls is None else calls
    paths = _paths(tmp_path)

    def write_glb(path):
        calls.append(("write_glb", path))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"new glb")

    def verify(path):
        calls.append(("verify", path))
        return {"faults": list(glb_faults)}

    def write_blend(path):
        calls.append(("write_blend", path))
        with open(path, "wb") as f:
            f.write(b"new blend")

    def check_blend(data):
        calls.append(("check_blend", data))
        return list(blend_faults)

    found = publish.publish_piece(paths["glb"], paths["blend"], paths["staging"],
                                  write_glb, verify, write_blend, check_blend)
    return found, paths, calls


def _seed_old(tmp_path):
    paths = _paths(tmp_path)
    for key in ("glb", "blend"):
        os.makedirs(os.path.dirname(paths[key]), exist_ok=True)
        with open(paths[key], "wb") as f:
            f.write(b"old")
    return paths


def _read(path):
    with open(path, "rb") as f:
        return f.read()


def test_a_good_export_lands_both_files_and_leaves_no_staging(tmp_path):
    _seed_old(tmp_path)
    found, paths, calls = _run(tmp_path)
    assert _read(paths["glb"]) == b"new glb"
    assert _read(paths["blend"]) == b"new blend"
    assert found["path"] == paths["glb"] and found["blend"] == paths["blend"]
    # Verified at the staging path, never at the final one.
    assert [c[0] for c in calls] == ["write_glb", "verify", "write_blend", "check_blend"]
    assert calls[1][1] != paths["glb"] and calls[1][1].startswith(paths["staging"])
    assert sorted(os.listdir(paths["staging"])) == ["town_tavern.blend"]


def test_a_glb_that_fails_its_check_touches_neither_file(tmp_path):
    _seed_old(tmp_path)
    calls = []
    with pytest.raises(RuntimeError, match="over budget"):
        _run(tmp_path, glb_faults=["over budget"], calls=calls)
    paths = _paths(tmp_path)
    assert _read(paths["glb"]) == b"old"
    assert _read(paths["blend"]) == b"old"
    assert "write_blend" not in [c[0] for c in calls]


def test_a_blend_that_carries_a_local_path_touches_neither_file(tmp_path):
    _seed_old(tmp_path)
    with pytest.raises(RuntimeError, match="local path"):
        _run(tmp_path, blend_faults=["it carries the local path \"/Users/x\""])
    paths = _paths(tmp_path)
    assert _read(paths["glb"]) == b"old"
    assert _read(paths["blend"]) == b"old"


def test_the_blend_check_reads_the_written_bytes(tmp_path):
    _, _, calls = _run(tmp_path)
    assert ("check_blend", b"new blend") in calls


def test_the_staging_folder_is_git_ignored():
    # `build/*.blend` is tracked, so staging there would leave a committable
    # file behind a crash; `build/staging/` is ignored whole.
    git = shutil.which("git")
    if git is None:
        pytest.skip("no git")
    for name in ("staging_town_tavern.blend", "staging_tavern.glb"):
        staged = os.path.join(publish.STAGING_DIR, name)
        found = subprocess.run([git, "check-ignore", "-q", staged],
                               cwd=publish.BOATS_DIR, capture_output=True)
        if found.returncode == 128:  # not inside a git work tree (an export of the repo)
            pytest.skip("not in a git work tree")
        assert found.returncode == 0, f"{name} under build/staging/ is not git-ignored"
