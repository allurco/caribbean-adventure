import { describe, it, expect } from "vitest";
import { generateMap } from "../../game/mapGenerator";
import { getMapPreset } from "../../game/mapConfig";
import { createWrap } from "../../game/hex";
import { sharedTerrainField } from "./sharedTerrainField";
import { landSurface } from "./landMesh";
import { streetDistance } from "./townPlateau";
import { streetEdgeStones } from "./townDetailLayout";
import { BUILDING_SCALE } from "./worldScale";

const preset = getMapPreset("small");
const wrap = createWrap(preset.columns);
const field = sharedTerrainField(generateMap(preset, 1, wrap), wrap);
const ground = landSurface(field);

describe("street edge stones (#91)", () => {
  it("lines both sides of every street, lanes included, with a kerb that runs on, not scattered stones", () => {
    for (const p of field.townPlateaus) {
      const stones = streetEdgeStones(p, ground, BUILDING_SCALE, []);
      for (const street of p.streets) {
        const len = Math.hypot(street.to[0] - street.from[0], street.to[1] - street.from[1]);
        const tx = (street.to[0] - street.from[0]) / len;
        const tz = (street.to[1] - street.from[1]) / len;
        const others = p.streets.filter((s) => s !== street);
        for (const side of [-1, 1]) {
          // This side's stones: by the edge, on this side of the centre line, not another street's.
          const mine = stones.filter((s) => {
            if (others.some((o) => streetDistance(o, s.x, s.z) < o.halfWidth * 1.5)) return false;
            const across = -(s.x - street.from[0]) * tz + (s.z - street.from[1]) * tx;
            const along = (s.x - street.from[0]) * tx + (s.z - street.from[1]) * tz;
            return Math.sign(across) === side && Math.abs(Math.abs(across) - street.halfWidth) < street.halfWidth * 0.5 && along > -1e-9 && along < len + 1e-9;
          });
          // Each runs along its street.
          for (const s of mine) expect(Math.abs(s.fx * tx + s.fz * tz)).toBeGreaterThan(0.99);
          // Laid end to end: where no other street crosses, they cover nearly all of the side.
          let open = 0;
          let covered = 0;
          for (let t = 0.005; t < len - 0.005; t += 0.001) {
            const x = street.from[0] + tx * t + -tz * side * (street.halfWidth - 0.001);
            const z = street.from[1] + tz * t + tx * side * (street.halfWidth - 0.001);
            if (others.some((o) => streetDistance(o, x, z) < o.halfWidth * 2)) continue;
            open++;
            const along = (sx: number, sz: number) => (x - sx) * tx + (z - sz) * tz;
            if (mine.some((s) => Math.abs(along(s.x, s.z)) <= s.halfD + 1e-9)) covered++;
          }
          if (street.kind !== "main" && open > 0) expect(covered / open).toBeGreaterThan(0.85);
        }
      }
    }
  });

  it("stands every kerb a little proud of the ground beside it and sunk into it below", () => {
    for (const p of field.townPlateaus) {
      for (const s of streetEdgeStones(p, ground, BUILDING_SCALE, [])) {
        const g = ground.sampleHeight(s.x, s.z);
        expect(s.y0).toBeLessThan(g);
        expect(s.y1).toBeGreaterThan(g);
        expect(s.y1 - g).toBeLessThan(0.01 * BUILDING_SCALE);
      }
    }
  });
});
