"""The BOARD variant: the ship as the game's board cameras see her.

The full export is built to hold up with a camera on deck, 30,000 to 53,000
triangles and 12 to 15 MB. The board draws six players and NPC fleets at map,
mid and ship zoom, so its variant is held to the game's contract (issue
#132): at most 4 MB, at most 20,000 triangles, no texture over 1024 px, the
origin, metres and bow axis of the full export, and the parts the game
tints -- Hull, Sails and the flag -- under their own names.

Two things make it: parts no board camera can see are DROPPED, and the rest
is THINNED by one ratio, chosen so the whole lands under the target. Canvas,
flag and rope are never thinned: they are already one quad a cell or two
triangles a rope, and a collapsed sail grid is a torn sail.
"""

import struct

import pytest

from frigate import board, gltf


def test_the_contract_is_the_games():
    assert board.MAX_TRIS == 20_000
    assert board.MAX_BYTES == 4_000_000
    assert board.MAX_TEXTURE == 1024
    assert board.ATLAS <= board.MAX_TEXTURE
    assert board.TARGET_TRIS < board.MAX_TRIS


def test_the_parts_the_game_names_are_never_dropped_or_thinned():
    for name in board.NAMED_PARTS:
        assert not board.hidden_from_above(name)
    for name in ("Sails", "Jolly_Roger", "Rigging"):
        assert name in board.WHOLE


def test_what_lies_under_a_deck_is_hidden_from_above():
    for name in ("Deck_Lower", "Ceiling_Lower", "Chase_Platform"):
        assert board.hidden_from_above(name)
    for name in ("Deck_Main", "Hull", "Cannon_00", "Masts"):
        assert not board.hidden_from_above(name)


COUNTS = {"Hull": 8000, "Sails": 2000, "Rigging": 800, "Jolly_Roger": 80,
          "Stern_Carving": 2800, "Cannon_00": 232, "Cannon_01": 232,
          "Deck_Lower": 600, "Masts": 700}


def test_the_plan_drops_the_hidden_and_thins_only_what_is_worth_it():
    plan = board.plan(COUNTS, target=8000)
    assert plan["drop"] == ["Deck_Lower"]
    # the two cannons are one family of 464, over the floor between them
    assert set(plan["thin"]) == {"Hull", "Stern_Carving", "Masts",
                                 "Cannon_00", "Cannon_01"}
    kept = 2000 + 800 + 80
    thinnable = 8000 + 2800 + 700 + 232 + 232
    assert plan["ratio"] == pytest.approx((8000 - kept) / thinnable)
    assert plan["expected"] <= 8000


def test_a_part_numbered_in_a_row_belongs_to_the_family_of_its_name():
    assert board.family("Cannon_00") == board.family("Cannon_23") == "Cannon"
    assert board.family("PortLid_07") == "PortLid"
    assert board.family("Deck_Main") == "Deck_Main"
    assert board.family("Deck_Quarter") == "Deck_Quarter"


def test_a_row_of_small_parts_is_thinned_when_the_row_is_worth_it():
    # the frigate's battery: no one gun is worth a collapse, all 24 are
    counts = {"Hull": 8000, "Sails": 2000}
    counts.update({f"Cannon_{i:02d}": 232 for i in range(24)})
    plan = board.plan(counts, target=6000)
    assert {f"Cannon_{i:02d}" for i in range(24)} <= set(plan["thin"])


def test_a_lone_small_part_is_kept_as_it_is():
    counts = {"Hull": 8000, "Sails": 2000, "Rudder": 144, "Transom": 104}
    plan = board.plan(counts, target=6000)
    assert plan["thin"] == ["Hull"]


def test_a_member_too_small_to_collapse_is_kept_even_in_a_large_row():
    # forty 12-triangle port lids are 480 between them, and each is a box
    counts = {"Hull": 8000, "Sails": 2000}
    counts.update({f"PortLid_{i:02d}": 12 for i in range(40)})
    plan = board.plan(counts, target=6000)
    assert plan["thin"] == ["Hull"]
    assert board.MEMBER_FLOOR > 12


def test_a_ship_already_under_the_target_is_not_thinned():
    plan = board.plan(COUNTS, target=100_000)
    assert plan["ratio"] == 1.0
    assert plan["thin"] == []


def test_a_target_the_untouchable_parts_alone_exceed_is_refused():
    with pytest.raises(ValueError, match="cannot"):
        board.plan(COUNTS, target=3000)


# --- reading a texture's size off its own bytes --------------------------


def _png(w, h):
    return (b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR"
            + struct.pack(">II", w, h) + b"\x08\x06\x00\x00\x00")


def _jpeg(w, h):
    sof = b"\xff\xc0" + struct.pack(">HBHH", 17, 8, h, w) + b"\x03" * 9
    app = b"\xff\xe0" + struct.pack(">H", 4) + b"\x00\x00"
    return b"\xff\xd8" + app + sof + b"\xff\xd9"


def test_a_png_and_a_jpeg_say_how_big_they_are():
    assert gltf.picture_size(_png(512, 256)) == (512, 256)
    assert gltf.picture_size(_jpeg(1024, 512)) == (1024, 512)


def test_bytes_that_are_neither_are_refused():
    with pytest.raises(ValueError):
        gltf.picture_size(b"GIF89a....")


def test_every_image_in_a_document_is_measured_off_its_buffer_view():
    pic = _png(300, 200)
    doc = {"images": [{"name": "a", "bufferView": 0,
                       "mimeType": "image/png"}],
           "bufferViews": [{"byteOffset": 4, "byteLength": len(pic)}]}
    binary = b"\x00" * 4 + pic
    assert gltf.image_dimensions(doc, binary) == [("a", 300, 200)]


def test_a_file_inside_the_contract_has_no_faults():
    assert board.contract_faults(
        3_900_000, 19_000, [("a", 512, 512)],
        ["Hull", "Sails", "Jolly_Roger", "Masts"]) == []


def test_each_breach_of_the_contract_is_named():
    faults = board.contract_faults(
        4_100_000, 21_000, [("a", 2048, 512)], ["Hull", "Masts"])
    text = " ".join(faults)
    for word in ("bytes", "triangles", "2048", "Sails", "Jolly_Roger"):
        assert word in text


def test_normal_maps_go_down_further_than_the_rest():
    assert board.atlas_size("normal") == board.NORMAL_ATLAS == 256
    assert board.atlas_size("albedo") == board.atlas_size("roughness") \
        == board.ATLAS == 512
