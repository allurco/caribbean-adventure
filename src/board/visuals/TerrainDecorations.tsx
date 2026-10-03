import { useMemo, useRef, useEffect } from "react";
import {
  InstancedMesh,
  Object3D,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
} from "three";
import type { MapCell, Decoration, Elevation } from "../../game/types";
import { hexToWorld } from "../../game/hex";
import { paletteColor } from "./palette";

// Height of hex TOP surface above water level for each elevation
const ELEVATION_TOP_HEIGHTS: Record<Elevation, number> = {
  0: 0,      // Water
  1: 0.05,   // Beach
  2: 0.25,   // Jungle
  3: 0.5,    // Mountain
};

// Create geometries for different decoration types
// Palm tree: tall thin trunk with spherical frond cluster at top
const palmTreeGeometries = {
  trunk: new CylinderGeometry(0.02, 0.035, 0.45, 6),  // Taller, thinner trunk
  fronds: new SphereGeometry(0.22, 8, 6),  // Spherical frond cluster
};

const rockGeometry = new SphereGeometry(0.12, 6, 5);
const pierGeometry = new BoxGeometry(0.15, 0.05, 0.6);

// Materials
const palmTrunkMaterial = new MeshStandardMaterial({ color: new Color(0.45, 0.35, 0.2) });  // Lighter brown
const palmFrondsMaterial = new MeshStandardMaterial({ color: new Color(0.2, 0.5, 0.15) });  // Tropical green
const rockMaterial = new MeshStandardMaterial({ color: paletteColor("highlandRock") });
// Fort disabled - port marker in HexGrid serves this purpose
// const fortMaterial = new MeshStandardMaterial({ color: new Color(0.75, 0.7, 0.6) });
const pierMaterial = new MeshStandardMaterial({ color: new Color(0.45, 0.35, 0.25) });

const tempObject = new Object3D();

interface DecorationData {
  type: Decoration["type"];
  worldX: number;
  worldY: number;
  worldZ: number;
  rotation: number;
  scale: number;
}

interface TerrainDecorationsProps {
  cells: MapCell[];
}

export function TerrainDecorations({ cells }: TerrainDecorationsProps) {
  // Collect all decorations with their world positions
  const decorationsByType = useMemo(() => {
    const trees: DecorationData[] = [];
    const rocks: DecorationData[] = [];
    const piers: DecorationData[] = [];

    for (const cell of cells) {
      if (!cell.decorations || cell.decorations.length === 0) continue;

      const [hexX, , hexZ] = hexToWorld(cell.hex);
      const baseY = ELEVATION_TOP_HEIGHTS[cell.elevation] ?? 0;

      for (const deco of cell.decorations) {
        const data: DecorationData = {
          type: deco.type,
          worldX: hexX + deco.position[0],
          worldY: baseY + deco.position[1],
          worldZ: hexZ + deco.position[2],
          rotation: deco.rotation,
          scale: deco.scale ?? 1,
        };

        switch (deco.type) {
          case "tree":
            trees.push(data);
            break;
          case "rock":
            rocks.push(data);
            break;
          // Fort disabled - port marker (octagon) in HexGrid serves this purpose
          case "pier":
            piers.push(data);
            break;
        }
      }
    }

    return { trees, rocks, piers };
  }, [cells]);

  // Refs for instanced meshes
  const treeTrunkRef = useRef<InstancedMesh>(null!);
  const treeFoliageRef = useRef<InstancedMesh>(null!);
  const rockRef = useRef<InstancedMesh>(null!);
  const pierRef = useRef<InstancedMesh>(null!);

  // Update palm tree trunk instances
  useEffect(() => {
    if (!treeTrunkRef.current || decorationsByType.trees.length === 0) return;

    const mesh = treeTrunkRef.current;
    decorationsByType.trees.forEach((tree, i) => {
      // Palm trunk: positioned at base, slight random lean
      tempObject.position.set(tree.worldX, tree.worldY + 0.22, tree.worldZ);
      // Slight lean based on rotation for natural look
      const lean = 0.1 + Math.sin(tree.rotation * 3) * 0.08;
      tempObject.rotation.set(lean, tree.rotation, 0);
      tempObject.scale.setScalar(tree.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [decorationsByType.trees]);

  // Update palm tree frond instances
  useEffect(() => {
    if (!treeFoliageRef.current || decorationsByType.trees.length === 0) return;

    const mesh = treeFoliageRef.current;
    decorationsByType.trees.forEach((tree, i) => {
      // Fronds at top of trunk, flattened sphere
      const lean = 0.1 + Math.sin(tree.rotation * 3) * 0.08;
      // Position fronds at top of leaning trunk
      const topOffsetX = Math.sin(lean) * 0.4;
      tempObject.position.set(
        tree.worldX + topOffsetX * Math.sin(tree.rotation),
        tree.worldY + 0.48,
        tree.worldZ + topOffsetX * Math.cos(tree.rotation)
      );
      tempObject.rotation.set(0, tree.rotation, 0);
      // Flatten the sphere to make frond cluster (wider than tall)
      tempObject.scale.set(tree.scale * 1.2, tree.scale * 0.6, tree.scale * 1.2);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [decorationsByType.trees]);

  // Update rock instances
  useEffect(() => {
    if (!rockRef.current || decorationsByType.rocks.length === 0) return;

    const mesh = rockRef.current;
    decorationsByType.rocks.forEach((rock, i) => {
      tempObject.position.set(rock.worldX, rock.worldY + 0.06, rock.worldZ);
      tempObject.rotation.set(0, rock.rotation, 0);
      // Vary rock shape slightly
      tempObject.scale.set(
        rock.scale * (0.8 + Math.sin(rock.rotation * 10) * 0.4),
        rock.scale * (0.6 + Math.cos(rock.rotation * 7) * 0.3),
        rock.scale * (0.8 + Math.sin(rock.rotation * 5) * 0.4)
      );
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [decorationsByType.rocks]);

  // Update pier instances
  useEffect(() => {
    if (!pierRef.current || decorationsByType.piers.length === 0) return;

    const mesh = pierRef.current;
    decorationsByType.piers.forEach((pier, i) => {
      // Offset pier towards water (rotation points towards docking hex)
      // Move ~0.7 units in the direction the pier faces to position at hex edge
      const offsetX = Math.sin(pier.rotation) * 0.7;
      const offsetZ = Math.cos(pier.rotation) * 0.7;

      // Piers are at water level, offset from hex center towards water
      tempObject.position.set(pier.worldX + offsetX, 0.02, pier.worldZ + offsetZ);
      tempObject.rotation.set(0, pier.rotation, 0);
      tempObject.scale.setScalar(pier.scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [decorationsByType.piers]);

  return (
    <>
      {/* Palm tree trunks */}
      {decorationsByType.trees.length > 0 && (
        <instancedMesh
          ref={treeTrunkRef}
          args={[palmTreeGeometries.trunk, palmTrunkMaterial, decorationsByType.trees.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}

      {/* Palm tree fronds */}
      {decorationsByType.trees.length > 0 && (
        <instancedMesh
          ref={treeFoliageRef}
          args={[palmTreeGeometries.fronds, palmFrondsMaterial, decorationsByType.trees.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}

      {/* Rocks */}
      {decorationsByType.rocks.length > 0 && (
        <instancedMesh
          ref={rockRef}
          args={[rockGeometry, rockMaterial, decorationsByType.rocks.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}

      {/* Piers */}
      {decorationsByType.piers.length > 0 && (
        <instancedMesh
          ref={pierRef}
          args={[pierGeometry, pierMaterial, decorationsByType.piers.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
    </>
  );
}
