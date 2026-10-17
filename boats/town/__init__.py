"""Parametric generator for the port town kit (PRD #392, ADR 0002 amendment (d)).

The ships' pattern, one piece at a time: pure params, a pure plan and a pure
board contract, tested with pytest without Blender; `build` and `export` are
the bpy half, run inside Blender, which writes the board `.glb` and reads it
back as bytes through the ships' own reader, `frigate.gltf`.
"""
