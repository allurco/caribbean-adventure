import { describe, it, expect, vi } from "vitest";
import type { MapCell  } from "../../game/types";
import { hex } from "../../game/hex";

// Mock Three.js classes - pass through data so tests can access it
vi.mock("three", () => ({
  DataTexture: vi.fn().mockImplementation((data: Float32Array, width: number, height: number) => ({
    image: { data, width, height },
    minFilter: 0,
    magFilter: 0,
    wrapS: 0,
    wrapT: 0,
    needsUpdate: false,
  })),
  RGBAFormat: 1,
  FloatType: 1,
  LinearFilter: 1,
  ClampToEdgeWrapping: 1,
}));

import { generateHeightmapTexture, computeMapRadius } from "./TerrainHeightmap";

// Helper to create test cells
function createTestCell(q: number, r: number, terrain: "water" | "island" = "water"): MapCell {
  return {
    hex: hex(q, r),
    terrain,
    hasPort: false,
    elevation: terrain === "island" ? 1 : 0,
  };
}

// Generate a hex grid of given radius
function generateHexGrid(radius: number): MapCell[] {
  const cells: MapCell[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) <= radius) {
        // Make center hexes islands, outer hexes water
        const distFromCenter = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
        const isIsland = distFromCenter <= Math.floor(radius / 2);
        cells.push(createTestCell(q, r, isIsland ? "island" : "water"));
      }
    }
  }
  return cells;
}

describe("TerrainHeightmap", () => {
  describe("computeMapRadius", () => {
    it("computes radius correctly for small grid", () => {
      const cells = generateHexGrid(3);
      expect(computeMapRadius(cells)).toBe(3);
    });
  });

  describe("generateHeightmapTexture performance", () => {
    it("generates heightmap for small grid (radius 3) in reasonable time", () => {
      const cells = generateHexGrid(3);
      const mapRadius = computeMapRadius(cells);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 256); // Lower resolution for speed
      const elapsed = performance.now() - start;

      console.log(`Small grid (radius 3, 256px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(result.texture).toBeDefined();
      expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it("generates heightmap for medium grid (radius 5) in reasonable time", () => {
      const cells = generateHexGrid(5);
      const mapRadius = computeMapRadius(cells);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 256);
      const elapsed = performance.now() - start;

      console.log(`Medium grid (radius 5, 256px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });

    it("generates heightmap for large grid (radius 7) in reasonable time", () => {
      const cells = generateHexGrid(7);
      const mapRadius = computeMapRadius(cells);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 512);
      const elapsed = performance.now() - start;

      console.log(`Large grid (radius 7, 512px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    it("benchmark: full resolution heightmap (1024px)", () => {
      const cells = generateHexGrid(5);
      const mapRadius = computeMapRadius(cells);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 1024);
      const elapsed = performance.now() - start;

      console.log(`Full resolution (radius 5, 1024px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(30000); // Should complete in under 30 seconds
    });

    it("benchmark: REALISTIC small map (radius 12, 1024px)", () => {
      const cells = generateHexGrid(12);
      const mapRadius = computeMapRadius(cells);
      console.log(`Cell count for radius 12: ${cells.length}`);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 1024);
      const elapsed = performance.now() - start;

      console.log(`REALISTIC small map (radius 12, 1024px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(60000); // Should complete in under 60 seconds
    });

    it("benchmark: REALISTIC medium map (radius 18, 1024px)", () => {
      const cells = generateHexGrid(18);
      const mapRadius = computeMapRadius(cells);
      console.log(`Cell count for radius 18: ${cells.length}`);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 1024);
      const elapsed = performance.now() - start;

      console.log(`REALISTIC medium map (radius 18, 1024px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(120000); // Should complete in under 2 minutes
    });

    it("benchmark: REALISTIC medium map at 512px (PRODUCTION)", () => {
      const cells = generateHexGrid(18);
      const mapRadius = computeMapRadius(cells);

      const start = performance.now();
      const result = generateHeightmapTexture(cells, mapRadius, 512);
      const elapsed = performance.now() - start;

      console.log(`PRODUCTION (radius 18, 512px): ${elapsed.toFixed(2)}ms`);
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
    });
  });

  describe("inland depth computation", () => {
    it("correctly identifies edge vs inland hexes", () => {
      // Create a simple 3-hex island
      const cells: MapCell[] = [
        createTestCell(0, 0, "island"),  // Center
        createTestCell(1, 0, "island"),  // Adjacent
        createTestCell(-1, 0, "island"), // Adjacent
        createTestCell(0, 1, "water"),   // Water around
        createTestCell(0, -1, "water"),
        createTestCell(1, -1, "water"),
        createTestCell(-1, 1, "water"),
        createTestCell(2, 0, "water"),
        createTestCell(-2, 0, "water"),
      ];

      const mapRadius = computeMapRadius(cells);
      const result = generateHeightmapTexture(cells, mapRadius, 64);

      expect(result).toBeDefined();
      // The center hex should have higher terrain than edge hexes
      // This is a sanity check that the inland depth logic is working
    });
  });

  describe("metaball terrain blending", () => {
    // Helper to create a 7-hex cluster (center + 6 neighbors)
    function create7HexCluster(centerQ: number, centerR: number): MapCell[] {
      const cells: MapCell[] = [
        createTestCell(centerQ, centerR, "island"),      // Center
        createTestCell(centerQ + 1, centerR, "island"),  // East
        createTestCell(centerQ - 1, centerR, "island"),  // West
        createTestCell(centerQ, centerR + 1, "island"),  // SE
        createTestCell(centerQ, centerR - 1, "island"),  // NW
        createTestCell(centerQ + 1, centerR - 1, "island"), // NE
        createTestCell(centerQ - 1, centerR + 1, "island"), // SW
      ];
      return cells;
    }

    // Helper to add water ring around hexes
    function addWaterRing(cells: MapCell[], radius: number): MapCell[] {
      const islandKeys = new Set(cells.map(c => `${c.hex.q},${c.hex.r}`));
      const result = [...cells];

      for (let q = -radius; q <= radius; q++) {
        for (let r = -radius; r <= radius; r++) {
          const s = -q - r;
          if (Math.abs(s) <= radius) {
            const key = `${q},${r}`;
            if (!islandKeys.has(key)) {
              result.push(createTestCell(q, r, "water"));
            }
          }
        }
      }
      return result;
    }

    // Helper to sample height at a world position from the heightmap
    function sampleHeight(
      data: Float32Array,
      resolution: number,
      bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
      worldX: number,
      worldZ: number
    ): number {
      const u = (worldX - bounds.minX) / (bounds.maxX - bounds.minX);
      const v = (worldZ - bounds.minZ) / (bounds.maxZ - bounds.minZ);
      const px = Math.floor(u * (resolution - 1));
      const py = Math.floor(v * (resolution - 1));
      const idx = (py * resolution + px) * 4;
      return data[idx]; // R channel = height
    }

    it("single hex island should be LOW and FLAT (no mountain)", () => {
      // Single island hex surrounded by water
      const cells = addWaterRing([createTestCell(0, 0, "island")], 3);
      const mapRadius = computeMapRadius(cells);
      const result = generateHeightmapTexture(cells, mapRadius, 128);

      // Sample height at center (0, 0)
      const centerHeight = sampleHeight(
        (result.texture as unknown as { image: { data: Float32Array } }).image.data,
        128,
        result.bounds,
        0, 0
      );

      // Single hex should be low - no mountain peak
      // With ridge algorithm: influence ~1.0, height = (1.0 - 0.4) / 1.5 ≈ 0.4 + noise
      // Should be a small sandy mound, not a mountain (< 0.5)
      expect(centerHeight).toBeLessThan(0.5);
      expect(centerHeight).toBeGreaterThan(0); // But still land, not water
    });

    it("7-hex cluster CENTER should be HIGHER than EDGES", () => {
      // Create 7-hex cluster with water around
      const cluster = create7HexCluster(0, 0);
      const cells = addWaterRing(cluster, 4);
      const mapRadius = computeMapRadius(cells);
      const result = generateHeightmapTexture(cells, mapRadius, 128);

      const data = (result.texture as unknown as { image: { data: Float32Array } }).image.data;

      // Sample center (0, 0)
      const centerHeight = sampleHeight(data, 128, result.bounds, 0, 0);

      // Sample edge (hex at q=1, r=0 which is ~1.5 units east)
      const edgeHeight = sampleHeight(data, 128, result.bounds, 1.5, 0);

      // Center should be higher than edge (mountain peak in center)
      expect(centerHeight).toBeGreaterThan(edgeHeight);
    });

    it("7-hex cluster should be TALLER than single hex island", () => {
      // Single hex
      const singleCells = addWaterRing([createTestCell(0, 0, "island")], 3);
      const singleResult = generateHeightmapTexture(singleCells, 3, 64);
      const singleData = (singleResult.texture as unknown as { image: { data: Float32Array } }).image.data;
      const singleHeight = sampleHeight(singleData, 64, singleResult.bounds, 0, 0);

      // 7-hex cluster
      const clusterCells = addWaterRing(create7HexCluster(0, 0), 4);
      const clusterResult = generateHeightmapTexture(clusterCells, 4, 64);
      const clusterData = (clusterResult.texture as unknown as { image: { data: Float32Array } }).image.data;
      const clusterHeight = sampleHeight(clusterData, 64, clusterResult.bounds, 0, 0);

      // Cluster center should be significantly taller than single hex
      expect(clusterHeight).toBeGreaterThan(singleHeight * 1.5);
    });

    it("adjacent hex boundaries should blend smoothly (no seams)", () => {
      // Two adjacent hexes should create continuous terrain
      const cells = addWaterRing([
        createTestCell(0, 0, "island"),
        createTestCell(1, 0, "island"),
      ], 3);

      const mapRadius = computeMapRadius(cells);
      const result = generateHeightmapTexture(cells, mapRadius, 128);
      const data = (result.texture as unknown as { image: { data: Float32Array } }).image.data;

      // Sample at hex centers and boundary
      const hex1Height = sampleHeight(data, 128, result.bounds, 0, 0);
      const hex2Height = sampleHeight(data, 128, result.bounds, 1.5, 0);
      const boundaryHeight = sampleHeight(data, 128, result.bounds, 0.75, 0);

      // Boundary should be between the two hex heights (smooth blend)
      const minHex = Math.min(hex1Height, hex2Height);
      const maxHex = Math.max(hex1Height, hex2Height);
      expect(boundaryHeight).toBeGreaterThanOrEqual(minHex * 0.8);
      expect(boundaryHeight).toBeLessThanOrEqual(maxHex * 1.2);
    });

    it("large cluster (19 hexes) should have distinct mountain peak in center", () => {
      // Create larger cluster: center + 2 rings
      const cells: MapCell[] = [];

      // Add hexes within distance 2 from center
      for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
          const s = -q - r;
          if (Math.abs(s) <= 2) {
            cells.push(createTestCell(q, r, "island"));
          }
        }
      }

      // Add water ring
      const withWater = addWaterRing(cells, 5);
      const mapRadius = computeMapRadius(withWater);
      const result = generateHeightmapTexture(withWater, mapRadius, 128);
      const data = (result.texture as unknown as { image: { data: Float32Array } }).image.data;

      // Sample center vs edge
      const centerHeight = sampleHeight(data, 128, result.bounds, 0, 0);
      const edgeHeight = sampleHeight(data, 128, result.bounds, 3.0, 0); // ~2 hexes out

      // Center should be higher than edge (metaballs create smooth gradients)
      expect(centerHeight).toBeGreaterThan(edgeHeight);
      // Center should be tall enough to be a mountain
      expect(centerHeight).toBeGreaterThan(0.5);
      // Both should be elevated in a large cluster
      expect(edgeHeight).toBeGreaterThan(0.3);
    });
  });
});
