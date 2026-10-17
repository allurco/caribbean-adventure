"""The town's colours. Pure -- imports no bpy.

Authored as sRGB hex, as a designer picks them, and stored LINEAR, because
glTF's `COLOR_0` is linear and the board's code-built pieces put linear
values in the same attribute (`paletteColor` in `src/board/visuals/palette.ts`
converts its hex the same way). The weathering ADR 0002 asks for -- grime at
the foot, tonal jitter per block, salt-pale stone -- is applied here, so
`build` only multiplies in the baked occlusion.
"""

# England (#392's table): dressed stone under limewashed panels and dark oak,
# a grey-blue slate roof, a brick stack. The shared warm palette's neutrals:
# a nation's palette tints them later through `_TINT`.
STONE = 0x9A8C7C        # a shade under `roughStone` (palette.ts): warm grey-brown blocks
MORTAR = 0x564E46
PLASTER = 0xE4DAC6      # `limewash`
OAK = 0x4B3F35          # `oldTimber`: salt-greyed beams
SLATE = 0x5C646E        # grey-blue slate, weathered
MOSS = 0x6F7552
BRICK = 0x8E4F3C
POT = 0xA2603F
GLASS = 0x7A5A34        # warm amber: the window glow's base, lit later (#392)
DOOR = 0x5C4433
SIGN = 0x7A3428         # the painted board
BENCH = 0x6B5642
IRON = 0x1B1816         # `ironwork`

# Grime rises this far up a wall from the ground, darkening the foot.
GRIME_HEIGHT = 1.2
GRIME_DEPTH = 0.32


def _to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear(hex_colour: int) -> tuple:
    """An sRGB hex colour as linear (r, g, b) in [0, 1]."""
    return tuple(_to_linear(((hex_colour >> s) & 0xFF) / 255.0)
                 for s in (16, 8, 0))


def jitter(rng, colour: tuple, amount: float) -> tuple:
    """`colour` scaled by one random tone in 1 +- amount, kept in range."""
    k = 1.0 + rng.uniform(-amount, amount)
    return tuple(min(1.0, max(0.0, c * k)) for c in colour)


def mix(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def grime(z: float) -> float:
    """The darkening at height `z` above the ground contact: deepest at the foot."""
    if z >= GRIME_HEIGHT:
        return 1.0
    t = max(0.0, z) / GRIME_HEIGHT
    return 1.0 - GRIME_DEPTH * (1.0 - t) ** 1.5


def corner_colour(face_colour: tuple, z: float, ao: float) -> tuple:
    """What one corner stores in `COLOR_0`: its face's colour, grimed, occluded."""
    k = grime(z) * ao
    return tuple(c * k for c in face_colour)
