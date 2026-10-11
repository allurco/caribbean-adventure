import ast
import pathlib

SRC = pathlib.Path(__file__).resolve().parents[1] / "frigate"


def _functions(filename):
    tree = ast.parse((SRC / filename).read_text())
    return {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}


def test_env_exposes_the_lifecycle_functions():
    assert {"setup_scene", "build_collection", "clear_build", "link"} <= _functions("env.py")


def test_checks_exposes_the_verification_helpers():
    assert {"tri_count", "bbox", "report"} <= _functions("checks.py")


def test_env_does_not_import_bpy_at_module_scope_in_params_or_profiles():
    """The math layer must stay testable off-Blender."""
    for pure in ("params.py", "profiles.py"):
        assert "import bpy" not in (SRC / pure).read_text()
