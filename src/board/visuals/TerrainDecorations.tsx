import { useRef, useEffect } from "react";
import {
  InstancedMesh,
  Object3D,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
} from "three";
import { paletteColor } from "./palette";
import { PalmTrees } from "./PalmTrees";
import { ROCK_RADIUS, type DecorationLayout } from "./useDecorationLayout";

// Rock centre above its base, per unit scale; the rest of the rock is buried.
const ROCK_LIFT = 0.04;

const rockGeometry = new SphereGeometry(ROCK_RADIUS, 6, 5);
const pierGeometry = new BoxGeometry(0.15, 0.05, 0.6);

// Materials
const rockMaterial = new MeshStandardMaterial({ color: paletteColor("highlandRock") });
// Fort disabled - port marker in HexGrid serves this purpose
// const fortMaterial = new MeshStandardMaterial({ color: new Color(0.75, 0.7, 0.6) });
const pierMaterial = new MeshStandardMaterial({ color: new Color(0.45, 0.35, 0.25) });

const tempObject = new Object3D();

/** Trees, rocks and piers for one world copy, from the shared `layout` (`useDecorationLayout`). */
export function TerrainDecorations({ layout: decorationsByType }: { layout: DecorationLayout }) {

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
      <PalmTrees resources={decorationsByType.palms} />

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
