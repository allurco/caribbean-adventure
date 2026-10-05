import { useMemo, useRef, useEffect } from "react";
import {
  InstancedMesh,
  Object3D,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
} from "three";
import type { MapCell, Decoration } from "../../game/types";
import { hexToWorld, type MapWrap } from "../../game/hex";
import { paletteColor } from "./palette";
import { sharedTerrainField } from "./sharedTerrainField";
import { placeOnGround, type GroundPlacementOptions } from "./groundPlacement";
import { PalmTrees } from "./PalmTrees";

const ROCK_RADIUS = 0.12;
// Rock centre above its base, per unit scale; the rest of the rock is buried.
const ROCK_LIFT = 0.04;

// Ground fit at scale 1. The footprint covers the trunk base plus its lean.
const TREE_PLACEMENT: GroundPlacementOptions = { footprintRadius: 0.06, sink: 0.03, maxSlope: 0.9 };
const ROCK_PLACEMENT: GroundPlacementOptions = { footprintRadius: ROCK_RADIUS, sink: 0.02, maxSlope: 1.6 };

const rockGeometry = new SphereGeometry(ROCK_RADIUS, 6, 5);
const pierGeometry = new BoxGeometry(0.15, 0.05, 0.6);

// Materials
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
  wrap: MapWrap;
}

export function TerrainDecorations({ cells, wrap }: TerrainDecorationsProps) {
  // Collect all decorations with their world positions
  const decorationsByType = useMemo(() => {
    const trees: DecorationData[] = [];
    const rocks: DecorationData[] = [];
    const piers: DecorationData[] = [];
    const field = sharedTerrainField(cells, wrap);

    for (const cell of cells) {
      if (!cell.decorations || cell.decorations.length === 0) continue;

      const [hexX, , hexZ] = hexToWorld(cell.hex);
      const anchor = { x: hexX, z: hexZ };

      for (const deco of cell.decorations) {
        const scale = deco.scale ?? 1;
        const spot = { x: hexX + deco.position[0], z: hexZ + deco.position[2] };

        // Trees and rocks stand on the height field: nudged off water and
        // cliffs towards the cell centre, or dropped if nowhere fits.
        const onGround = (placement: GroundPlacementOptions): DecorationData | null => {
          const ground = placeOnGround(field, spot, anchor, {
            ...placement,
            footprintRadius: placement.footprintRadius * scale,
          });
          if (!ground) return null;
          return {
            type: deco.type,
            worldX: ground.x,
            worldY: ground.y + deco.position[1],
            worldZ: ground.z,
            rotation: deco.rotation,
            scale,
          };
        };

        switch (deco.type) {
          case "tree": {
            const tree = onGround(TREE_PLACEMENT);
            if (tree) trees.push(tree);
            break;
          }
          case "rock": {
            const rock = onGround(ROCK_PLACEMENT);
            if (rock) rocks.push(rock);
            break;
          }
          // Fort disabled - port marker (octagon) in HexGrid serves this purpose
          case "pier":
            // Piers sit at water level, so only their XZ matters
            piers.push({
              type: deco.type,
              worldX: spot.x,
              worldY: 0,
              worldZ: spot.z,
              rotation: deco.rotation,
              scale,
            });
            break;
        }
      }
    }

    return { trees, rocks, piers };
  }, [cells, wrap]);

  // Refs for instanced meshes
  const rockRef = useRef<InstancedMesh>(null!);
  const pierRef = useRef<InstancedMesh>(null!);

  // Update rock instances
  useEffect(() => {
    if (!rockRef.current || decorationsByType.rocks.length === 0) return;

    const mesh = rockRef.current;
    decorationsByType.rocks.forEach((rock, i) => {
      tempObject.position.set(rock.worldX, rock.worldY + ROCK_LIFT * rock.scale, rock.worldZ);
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
      <PalmTrees palms={decorationsByType.trees} />

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
