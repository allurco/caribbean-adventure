"""Present so pytest prepends the repo root to sys.path, making `frigate` importable.

Without this, pytest's prepend import mode inserts `tests/` (the first directory
without an __init__.py) and `import frigate` fails during collection.
"""
