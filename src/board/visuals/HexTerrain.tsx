import { useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Color,
} from "three";
import type { MapCell } from "../../game/types";
import { hexToWorld } from "../../game/hex";

const HEX_RADIUS = 1.0;
const HEX_SPACING = Math.sqrt(3); // Distance between adjacent hex centers

// Subdivision: 3 concentric rings → 54 triangles per hex
const RINGS = 3;

// Biome colors
const COLORS = {
  SAND: new Color(0.82, 0.72, 0.55),
  GRASS: new Color(0.22, 0.55, 0.28),
  ROCK: new Color(0.50, 0.47, 0.42),
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Hash returning [0, 1)
function hash(x: number, y: number): number {
  const dot = x * 127.1 + y * 311.7;
  const s = Math.sin(dot) * 43758.5453;
  return s - Math.floor(s);
}

interface CellLookup {
  positions: Map<string, [number, number, number]>;
  landCells: MapCell[];
  inlandDepths: Map<string, number>;
}

function buildCellLookup(cells: MapCell[]): CellLookup {
  const positions = new Map<string, [number, number, number]>();
  const landCells: MapCell[] = [];
  const waterCells: MapCell[] = [];

  for (const cell of cells) {
    const key = `${cell.hex.q},${cell.hex.r}`;
    positions.set(key, hexToWorld(cell.hex));
    if (cell.terrain === "island") {
      landCells.push(cell);
    } else {
      waterCells.push(cell);
    }
  }

  const inlandDepths = new Map<string, number>();
  for (const landCell of landCells) {
    const landKey = `${landCell.hex.q},${landCell.hex.r}`;
    const landPos = positions.get(landKey)!;
    let minDist = Infinity;

    for (const waterCell of waterCells) {
      const waterPos = positions.get(`${waterCell.hex.q},${waterCell.hex.r}`)!;
      const dx = landPos[0] - waterPos[0];
      const dz = landPos[2] - waterPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }

    inlandDepths.set(landKey, minDist);
  }

  return { positions, landCells, inlandDepths };
}

function calculateHeight(depthInHexes: number): number {
  if (depthInHexes < 1) {
    return 0.15 + depthInHexes * 0.15;
  } else if (depthInHexes < 2) {
    return 0.30 + (depthInHexes - 1) * 0.35;
  } else if (depthInHexes < 3) {
    return 0.65 + (depthInHexes - 2) * 0.45;
  } else {
    return 1.1 + Math.min((depthInHexes - 3) * 0.5, 0.8);
  }
}

function getBiomeColor(depthInHexes: number, x: number, z: number): Color {
  const variation = 0.9 + hash(x * 10, z * 10) * 0.2;
  const color = new Color();

  if (depthInHexes < 1.0) {
    color.copy(COLORS.SAND);
  } else if (depthInHexes < 2.0) {
    const t = smoothstep(0.8, 1.5, depthInHexes);
    color.copy(COLORS.SAND).lerp(COLORS.GRASS, t);
  } else if (depthInHexes < 3.0) {
    color.copy(COLORS.GRASS);
  } else {
    const t = smoothstep(2.5, 4.0, depthInHexes);
    color.copy(COLORS.GRASS).lerp(COLORS.ROCK, t);
  }

  color.multiplyScalar(variation);
  return color;
}

interface Vertex {
  x: number;
  y: number;
  z: number;
}

// Push a single triangle with uniform face color (flat shading).
// Winding order: v0 → v1 → v2 must produce upward (+Y) normals
// via cross((v1-v0), (v2-v0)).
function pushTriangle(
  positions: number[],
  colors: number[],
  v0: Vertex,
  v1: Vertex,
  v2: Vertex,
  depthInHexes: number
): void {
  positions.push(v0.x, v0.y, v0.z);
  positions.push(v1.x, v1.y, v1.z);
  positions.push(v2.x, v2.y, v2.z);

  const midX = (v0.x + v1.x + v2.x) / 3;
  const midZ = (v0.z + v1.z + v2.z) / 3;
  const color = getBiomeColor(depthInHexes, midX, midZ);
  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);
  colors.push(color.r, color.g, color.b);
}

/**
 * Generate flat-shaded triangles for one hex using sector-based triangulation.
 *
 * The hex is divided into 6 sectors (60° each). Within each sector,
 * concentric ring strips are triangulated cleanly:
 *   - Ring k has k*6 vertices total → k+1 vertices per sector
 *   - Strip from ring (k-1) to ring k: m inner verts → m+1 outer verts → 2m-1 triangles
 *
 * Total triangles: 6 sectors × (1 + 3 + 5) = 54 for RINGS=3.
 */
function generateHexGeometry(
  centerX: number,
  centerZ: number,
  cellInlandDepth: number
): { positions: number[]; colors: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const depthInHexes = cellInlandDepth / HEX_SPACING;

  // Height at a given normalized distance (0 = center, 1 = hex edge)
  const getHeight = (distNorm: number): number => {
    if (distNorm === 0) return calculateHeight(depthInHexes);
    const effectiveDepth = depthInHexes * (1 - distNorm * 0.5);
    let h = calculateHeight(effectiveDepth);
    if (distNorm > 0.8) {
      h *= smoothstep(1.0, 0.8, distNorm);
    }
    return h;
  };

  // Pre-compute vertices for each ring
  // ringVerts[0] = [center], ringVerts[k] = array of k*6 vertices
  const ringVerts: Vertex[][] = [];

  // Ring 0: center
  ringVerts.push([{ x: centerX, y: getHeight(0), z: centerZ }]);

  // Rings 1..RINGS
  for (let k = 1; k <= RINGS; k++) {
    const count = k * 6;
    const radius = (k / RINGS) * HEX_RADIUS;
    const dist = k / RINGS;
    const h = getHeight(dist);
    const verts: Vertex[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      verts.push({
        x: centerX + Math.cos(angle) * radius,
        y: h,
        z: centerZ + Math.sin(angle) * radius,
      });
    }
    ringVerts.push(verts);
  }

  // Triangulate by sector
  for (let sector = 0; sector < 6; sector++) {
    for (let ring = 1; ring <= RINGS; ring++) {
      const innerRingIdx = ring - 1;

      if (innerRingIdx === 0) {
        // Center to ring 1: 1 triangle per sector
        const center = ringVerts[0][0];
        const o0 = ringVerts[1][sector];
        const o1 = ringVerts[1][(sector + 1) % 6];
        // Winding for upward normal: center → o1 → o0
        // cross((o1-center), (o0-center)).y > 0 when angles go CCW
        pushTriangle(positions, colors, center, o1, o0, depthInHexes);
      } else {
        // Ring-to-ring strip within this sector
        // Inner ring k has k+1 vertices per sector at indices: sector*k .. sector*k + k
        // Outer ring k+1 has k+2 vertices per sector at indices: sector*(k+1) .. sector*(k+1) + (k+1)
        const innerK = innerRingIdx;
        const outerK = ring;
        const innerRing = ringVerts[innerK];
        const outerRing = ringVerts[outerK];
        const innerTotal = innerK * 6;
        const outerTotal = outerK * 6;

        // Collect sector vertices
        const innerSector: Vertex[] = [];
        for (let j = 0; j <= innerK; j++) {
          innerSector.push(innerRing[(sector * innerK + j) % innerTotal]);
        }
        const outerSector: Vertex[] = [];
        for (let j = 0; j <= outerK; j++) {
          outerSector.push(outerRing[(sector * outerK + j) % outerTotal]);
        }

        // Triangulate: m inner verts, m+1 outer verts
        const m = innerSector.length; // innerK + 1
        for (let i = 0; i < m; i++) {
          // "Down" triangle: inner[i] → outer[i+1] → outer[i]
          pushTriangle(
            positions, colors,
            innerSector[i], outerSector[i + 1], outerSector[i],
            depthInHexes
          );
          // "Up" triangle (between consecutive inner verts): inner[i] → inner[i+1] → outer[i+1]
          if (i < m - 1) {
            pushTriangle(
              positions, colors,
              innerSector[i], innerSector[i + 1], outerSector[i + 1],
              depthInHexes
            );
          }
        }
      }
    }
  }

  return { positions, colors };
}

interface HexTerrainProps {
  cells: MapCell[];
}

export function HexTerrain({ cells }: HexTerrainProps) {
  const geometry = useMemo(() => {
    const lookup = buildCellLookup(cells);

    const allPositions: number[] = [];
    const allColors: number[] = [];

    for (const cell of lookup.landCells) {
      const key = `${cell.hex.q},${cell.hex.r}`;
      const worldPos = lookup.positions.get(key)!;
      const inlandDepth = lookup.inlandDepths.get(key) ?? 0;

      const { positions, colors } = generateHexGeometry(
        worldPos[0],
        worldPos[2],
        inlandDepth
      );

      allPositions.push(...positions);
      allColors.push(...colors);
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(allPositions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(allColors, 3));
    geo.computeVertexNormals();

    return geo;
  }, [cells]);

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0,
      }),
    []
  );

  return (
    <mesh geometry={geometry} material={material} receiveShadow castShadow />
  );
}
