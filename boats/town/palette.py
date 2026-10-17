"""The town's colours. Pure -- imports no bpy.

Authored as sRGB hex, as a designer picks them, and stored LINEAR, because
glTF's `COLOR_0` is linear and the board's code-built pieces put linear
values in the same attribute (`paletteColor` in `src/board/visuals/palette.ts`
converts its hex the same way). The weathering ADR 0002 asks for -- grime at
the foot, tonal jitter per block, salt-pale stone -- is applied here, so
`build` only multiplies in the baked occlusion.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class StylePalette:
    """One nation style's colours, as sRGB hex. The surfaces a nation's
    palette will colour later (#180, through `_TINT`) are authored as light,
    warm neutrals, so a tint multiplies into them; the rest are the piece's
    own weathered materials."""

    stone: int       # the ground storey's dressed blocks
    salt: int        # salt-pale stone, mixed into some blocks
    warm: int        # warm-stained stone, mixed into others
    mortar: int      # the ledges between set-back courses
    plaster: int     # the limewashed panels (tint channel 1)
    oak: int         # beams, posts, braces, bargeboards (channel 3)
    roof: int        # the roof's courses (channel 2)
    moss: int
    brick: int
    pot: int
    glass: int       # warm amber: the window glow's base, lit later (#392)
    door: int
    sign: int        # the painted board
    bench: int
    iron: int


# England (#392's table): dressed stone under limewashed panels and dark oak,
# a steep roof of weathered, warm grey-brown shingle, a brick stack.
ENGLAND = StylePalette(
    stone=0xA28C72,      # warm sandstone-grey blocks, a shade over `roughStone`
    salt=0xE0D5C0,
    warm=0xA8865F,
    mortar=0x66574A,
    plaster=0xEDDDC0,    # `limewash`, a touch warmer
    oak=0x5A4636,        # `oldTimber`, warmer
    roof=0xAE9C82,       # weathered shingle: light and warm, for #180's roof tint
    moss=0x737650,
    brick=0x96553D,
    pot=0xA8643F,
    glass=0x7A5A34,
    door=0x5E4532,
    sign=0x7A3428,
    bench=0x6E5843,
    iron=0x1B1816,       # `ironwork`
)

PALETTES = {"england": ENGLAND}

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
