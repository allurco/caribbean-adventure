import { describe, expect, it } from "vitest";
import { createCombatShipPoses } from "./combatShipPoses";

describe("combat ship poses: where the ships are, and where a fight puts them (#263)", () => {
  it("keeps the last pose each ship reported, even after it is gone", () => {
    const poses = createCombatShipPoses();
    poses.report("0", { x: 1, z: 2, heading: 0.5, copyX: 0, anchor: null });
    poses.report("0", { x: 1.5, z: 2, heading: 0.6, copyX: 0, anchor: null });
    expect(poses.reported("0")).toMatchObject({ x: 1.5, z: 2, heading: 0.6 });
    expect(poses.reported("1")).toBeUndefined();
  });

  it("a ship a fight holds follows the fight's pose until let go", () => {
    const poses = createCombatShipPoses();
    expect(poses.held("0")).toBeUndefined();
    const pose = poses.hold("0", { x: 1, z: 2, heading: 0 });
    pose.heading = 1.2;
    pose.heel = 0.1;
    expect(poses.held("0")).toMatchObject({ x: 1, z: 2, heading: 1.2, heel: 0.1, pitch: 0, drop: 0 });
    // Holding it again keeps the pose it has
    expect(poses.hold("0", { x: 9, z: 9, heading: 9 })).toBe(pose);
    poses.release("0");
    expect(poses.held("0")).toBeUndefined();
  });

  it("lists the ships it holds, and lets them all go", () => {
    const poses = createCombatShipPoses();
    poses.hold("0", { x: 0, z: 0, heading: 0 });
    poses.hold("npc-1", { x: 0, z: 0, heading: 0 });
    expect([...poses.heldIds()].sort()).toEqual(["0", "npc-1"]);
    poses.releaseAll();
    expect([...poses.heldIds()]).toEqual([]);
  });
});
