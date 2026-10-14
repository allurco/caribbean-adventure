import { describe, it, expect } from "vitest";
import { reachClick, reachConfirm, selectionKey } from "./routeSelection";
import { turnReach } from "../game/reach";
import { hex, hexGrid, NO_WRAP } from "../game/hex";
import type { MapCell } from "../game/types";

const cells: MapCell[] = hexGrid(5).map((h) => ({ hex: h, terrain: "water", hasPort: false, elevation: 0 }));
const reach = turnReach(hex(0, 0), 3, cells, NO_WRAP);
const far = hex(3, 0);

describe("reachClick", () => {
  it("moves at once to a neighbouring hex, as one click always did", () => {
    expect(reachClick(reach, null, hex(1, 0))).toEqual({ kind: "move", hex: hex(1, 0) });
    expect(reachClick(reach, far, hex(1, 0))).toEqual({ kind: "move", hex: hex(1, 0) });
  });

  it("selects a farther hex in reach, to preview its route", () => {
    expect(reachClick(reach, null, far)).toEqual({ kind: "select", hex: far });
  });

  it("selects another hex when a different one was selected", () => {
    expect(reachClick(reach, hex(2, 0), far)).toEqual({ kind: "select", hex: far });
  });

  it("sails the route on a second click on the selected hex", () => {
    const click = reachClick(reach, far, far);
    expect(click.kind).toBe("sail");
    if (click.kind === "sail") {
      expect(click.route).toHaveLength(3);
      expect(click.route[2]).toEqual(far);
    }
  });

  it("cancels the preview on a hex out of reach", () => {
    expect(reachClick(reach, far, hex(5, 0))).toEqual({ kind: "cancel" });
  });
});

describe("reachConfirm", () => {
  it("sails to the selected hex, else the hovered one", () => {
    expect(reachConfirm(reach, far, hex(2, 0)).at(-1)).toEqual(far);
    expect(reachConfirm(reach, null, hex(2, 0))).toHaveLength(2);
  });

  it("is nothing with neither, or one out of reach", () => {
    expect(reachConfirm(reach, null, null)).toEqual([]);
    expect(reachConfirm(reach, hex(5, 0), null)).toEqual([]);
  });
});

describe("selectionKey", () => {
  it("changes when the ship moves or the turn passes", () => {
    const k = selectionKey("0", hex(1, 2));
    expect(selectionKey("0", hex(1, 2))).toBe(k);
    expect(selectionKey("0", hex(2, 2))).not.toBe(k);
    expect(selectionKey("1", hex(1, 2))).not.toBe(k);
  });
});
