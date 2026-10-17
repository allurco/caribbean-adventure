"""Town piece parameters. Pure data -- imports no bpy, so it is testable off-Blender.

All lengths in metres, in Blender's frame: x across the front, -y out of the
front (glTF +Z, the board's door side), z up, the origin at the ground
contact under the plan centre (ADR 0002 amendment (d)).

`TavernParams` is the first piece: the reference's two-storey English tavern
(#392's target look) -- a stone ground storey, a jettied half-timbered upper
storey, a steep slate roof with its ridge along x, a brick chimney stack,
a hanging sign and two benches by the door.

THE PLAN IS THE BOARD'S, NOT OURS. The layout already places a tavern with a
footprint of its own (`AGED_BUILDING_PLAN.tavern` in
`src/board/visuals/agedBuildingGeometry.ts`, 0.11 x 0.09 at scale 1, one unit
being `METRES_PER_UNIT` = 65 m before the family factor), so the model takes
that footprint, that height (`AGED_BUILDING_HEIGHT.tavern`, 0.278) and that
footing (`BUILDING_FOOTING`, 0.16) in metres, and the placement sweeps stay
as they are. `test_town_frozen.py` pins the three.
"""

from dataclasses import dataclass

# The nation styles the kit will dress (#392's table). England first.
STYLES = ("england",)

METRES_PER_UNIT = 65.0


@dataclass
class TavernParams:
    style: str = "england"
    variant: int = 0
    seed: int = 394

    # --- the plan the board plans with --------------------------------------
    half_width: float = 0.11 * METRES_PER_UNIT    # 7.15, across the front
    half_depth: float = 0.09 * METRES_PER_UNIT    # 5.85, front to back
    height: float = 0.278 * METRES_PER_UNIT       # 18.07, the chimney pots' top
    footing: float = 0.16 * METRES_PER_UNIT       # 10.4 under the ground contact

    # --- the storeys ---------------------------------------------------------
    plinth_proud: float = 0.25    # the footing stands this proud of the walls
    ground_storey: float = 4.6    # top of the stone storey
    upper_storey: float = 9.1     # the eave: the code-built tavern's wall top
    jetty: float = 0.4            # the upper storey overhangs the front
    stone_courses: int = 5
    block_length: float = 1.8     # chunky: a block reads at ship zoom

    # --- the roof ------------------------------------------------------------
    ridge: float = 15.6           # the ridge cap's top
    eave_overhang: float = 0.7    # past the upper storey, front and back
    gable_overhang: float = 0.45  # past the gable walls
    slate_rows: int = 8
    slate_segments: int = 6       # each row in this many tones

    # --- the dressing --------------------------------------------------------
    chimney_x: float = 4.4        # the stack on the ridge, towards +x
    chimney_half: float = 0.85
    sign_height: float = 6.2      # the sign board's top
    benches: int = 2

    @property
    def asset_stem(self) -> str:
        return "tavern"

    @property
    def kind(self) -> str:
        return "tavern"

    def validate(self) -> None:
        """Raise ValueError on parameters that would build inverted geometry."""
        if self.style not in STYLES:
            raise ValueError(f"style must be one of {STYLES}, got {self.style!r}")
        for name in ("half_width", "half_depth", "height", "footing",
                     "ground_storey", "upper_storey", "ridge", "block_length",
                     "chimney_half"):
            value = getattr(self, name)
            if value <= 0:
                raise ValueError(f"{name} must be positive, got {value}")
        for name in ("stone_courses", "slate_rows", "slate_segments"):
            if getattr(self, name) < 1:
                raise ValueError(f"{name} must be at least 1")
        if not self.ground_storey < self.upper_storey:
            raise ValueError("the stone storey must stand under the upper storey")
        if not self.upper_storey + 2.0 < self.ridge < self.height:
            raise ValueError(
                f"the roof needs room: eave {self.upper_storey}, ridge "
                f"{self.ridge}, top {self.height}")
        if not 0.0 <= self.jetty < self.eave_overhang:
            raise ValueError(
                f"the jetty ({self.jetty}) must stay under the roof overhang "
                f"({self.eave_overhang})")
        if not 0.0 < self.chimney_x + self.chimney_half < self.half_width:
            raise ValueError("the chimney must stand inside the gables")
        if not 2.5 < self.sign_height < self.upper_storey:
            raise ValueError("the sign must hang clear of the ground, under the eave")
        if self.benches < 0:
            raise ValueError("benches must not be negative")
