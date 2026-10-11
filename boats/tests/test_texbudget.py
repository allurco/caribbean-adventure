"""The texture budget: what format each atlas ships in, and how the JPEG
quality was CHOSEN rather than picked. No bpy, no numpy.

The quality is not a taste judgement. JPEG's one artefact that cannot be
mistaken for the asset's own procedural grain is RINGING — the truncated DCT
overshoots a step edge and puts values outside anything the original line held.
Blur stays inside the range; blocking stays inside the range; ringing does not.
So the measure is the overshoot across lines drawn through the two hardest
edges on the ship, and the threshold it is judged against is the strake's own
grain, measured off the same atlas.
"""

import pytest

from frigate import texbudget


# --- which format each atlas ships in ----------------------------------------


def test_normals_are_png_whatever_else_happens():
    """JPEG ringing in a normal map is shading error, and the two carvings are
    the detail that depends on it."""
    assert texbudget.image_format("normal", carries_alpha=False) == texbudget.PNG
    assert texbudget.image_format("normal", carries_alpha=True) == texbudget.PNG


def test_albedo_and_roughness_are_jpeg():
    for kind in ("albedo", "roughness"):
        assert texbudget.image_format(kind, carries_alpha=False) == texbudget.JPEG


def test_an_albedo_carrying_the_alpha_cut_stays_png_because_jpeg_has_no_alpha():
    """The rigging's alpha cut lives in the albedo's alpha channel. JPEG has no
    channel to put it in, so that one atlas pays for itself in PNG or the 741
    ribbons go back to being flat tape."""
    assert texbudget.image_format("albedo", carries_alpha=True) == texbudget.PNG


def test_only_the_albedo_is_excused_by_alpha_a_roughness_map_has_none_to_lose():
    """The first form of this excused the whole family and sent the rope's
    roughness atlas back to lossless for an alpha channel it does not have."""
    assert texbudget.image_format("roughness", carries_alpha=True) == texbudget.JPEG


def test_an_unknown_kind_is_refused_rather_than_guessed():
    with pytest.raises(ValueError):
        texbudget.image_format("occlusion", carries_alpha=False)


def test_every_format_has_the_mime_type_the_glb_will_carry():
    assert texbudget.mime_of(texbudget.PNG) == "image/png"
    assert texbudget.mime_of(texbudget.JPEG) == "image/jpeg"


# --- the artefact measure ----------------------------------------------------


def test_a_perfect_round_trip_has_no_overshoot():
    line = [0.1, 0.1, 0.9, 0.9]
    assert texbudget.ring_overshoot(line, line) == 0.0


def test_blur_alone_is_not_an_artefact_this_measure_reports():
    """A blurred edge stays inside the range the original held. It is a loss of
    sharpness, not the halo that reads as a fault at a paint boundary."""
    original = [0.1, 0.1, 0.9, 0.9]
    blurred = [0.1, 0.3, 0.7, 0.9]
    assert texbudget.ring_overshoot(original, blurred) == 0.0


def test_ringing_is_measured_as_the_excursion_outside_the_originals_range():
    original = [0.1, 0.1, 0.9, 0.9]
    rung = [0.04, 0.1, 0.9, 0.96]
    assert texbudget.ring_overshoot(original, rung) == pytest.approx(0.06)


def test_overshoot_above_the_top_counts_as_much_as_below_the_bottom():
    original = [0.1, 0.9]
    assert texbudget.ring_overshoot(original, [0.1, 0.95]) == pytest.approx(0.05)
    assert texbudget.ring_overshoot(original, [0.05, 0.9]) == pytest.approx(0.05)


def test_an_empty_line_is_refused_rather_than_scored_zero():
    with pytest.raises(ValueError):
        texbudget.ring_overshoot([], [])


def test_the_two_lines_must_be_the_same_length():
    with pytest.raises(ValueError):
        texbudget.ring_overshoot([0.1, 0.9], [0.1, 0.5, 0.9])


def test_the_grain_is_the_peak_to_peak_of_the_flat_paint_itself():
    """What the strake's own procedural noise swings by. Ringing smaller than
    this cannot be told apart from the texture that is supposed to be there."""
    assert texbudget.peak_to_peak([0.70, 0.73, 0.69, 0.72]) == pytest.approx(0.04)


# --- choosing the quality ----------------------------------------------------


def _sweep(pairs):
    return tuple(texbudget.EdgeSample(q, o, 0.0) for q, o in pairs)


def test_the_onset_is_the_highest_quality_at_which_ringing_clears_the_grain():
    sweep = _sweep([(95, 0.004), (90, 0.008), (85, 0.019), (80, 0.031)])
    assert texbudget.onset(sweep, grain=0.015) == 85


def test_a_sweep_that_never_shows_an_artefact_has_no_onset():
    sweep = _sweep([(95, 0.004), (90, 0.008)])
    assert texbudget.onset(sweep, grain=0.015) is None


def test_shipping_at_or_below_the_onset_is_a_fault():
    sweep = _sweep([(95, 0.004), (90, 0.008), (85, 0.019), (80, 0.031)])
    faults = texbudget.quality_faults(85, sweep, grain=0.015, margin=5)
    assert any("85" in f and "onset" in f for f in faults)


def test_shipping_too_close_above_the_onset_is_a_fault():
    """Above the onset is not enough: the onset is a measurement with its own
    scatter, and a quality one step above it is inside that scatter."""
    sweep = _sweep([(95, 0.004), (90, 0.008), (86, 0.014), (85, 0.019)])
    assert texbudget.quality_faults(86, sweep, grain=0.015, margin=5)
    assert not texbudget.quality_faults(90, sweep, grain=0.015, margin=5)


def test_a_quality_that_was_never_measured_cannot_be_shipped():
    """The brief says pick it by measuring. A number that is not in the sweep
    was not measured, whatever else it was."""
    sweep = _sweep([(95, 0.004), (90, 0.008), (85, 0.019)])
    assert any("never measured" in f
               for f in texbudget.quality_faults(92, sweep, grain=0.015, margin=1))


def test_the_shipped_quality_this_project_chose_survives_its_own_sweep():
    """The measurement recorded in the module, judged by the module's own rule."""
    assert texbudget.quality_faults(
        texbudget.JPEG_QUALITY, texbudget.SWEEP, texbudget.GRAIN) == []


def test_the_recorded_sweep_really_does_cross_the_grain_somewhere():
    """A sweep that never reaches an artefact has not found the edge of the
    cliff, and a quality chosen off it is not chosen, only asserted."""
    assert texbudget.onset(texbudget.SWEEP, texbudget.GRAIN) is not None


def test_the_atlas_is_half_what_it_was():
    assert texbudget.ATLAS_SIZE == 1024
