import { useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Plane, Vector3, type Group } from "three";
import { controlsTarget } from "./controlsTarget";
import { copyShiftToward } from "./wrapView";

interface WorldCopiesProps {
  /** Wrap width in world units; Infinity draws the children once, unmoved. */
  period: number;
  /** West edge of the strip the world is built over (`seamStrip.ts`). */
  stripMinX: number;
  /** Copies to draw, counted from the one the camera focus is in (`wrapCopyRange`). */
  from: number;
  to: number;
  /**
   * One copy's contents, given its number. Build heavy geometry once above
   * the copies and only draw it here: everything returned is mounted per copy.
   */
  children: (copy: number) => ReactNode;
}

/**
 * Draws its children once per copy of a wrapping world, one wrap width
 * apart, and keeps the copies around the camera focus as it pans east or west
 * (#36). The copies move only by whole wrap widths, so nothing on screen
 * jumps; positions are set per frame, with no React state.
 */
export function WorldCopies({ period, stripMinX, from, to, children }: WorldCopiesProps) {
  const controls = useThree((state) => state.controls);
  const groups = useRef<(Group | null)[]>([]);
  const offsets = useMemo(() => Array.from({ length: to - from + 1 }, (_, i) => from + i), [from, to]);

  useFrame(() => {
    const focus = controlsTarget(controls);
    if (!focus || !Number.isFinite(period)) return;
    const base = Math.floor((focus.x - stripMinX) / period);
    offsets.forEach((k, i) => {
      const group = groups.current[i];
      if (group) group.position.x = (base + k) * period;
    });
  });

  if (!Number.isFinite(period)) return <>{children(0)}</>;
  return (
    <>
      {offsets.map((k, i) => (
        <group
          key={k}
          ref={(group) => {
            groups.current[i] = group;
          }}
        >
          {children(k)}
        </group>
      ))}
    </>
  );
}

const seaLevel = new Plane(new Vector3(0, 1, 0), 0);
const pointerOnSea = new Vector3();

interface PointerCopyProps {
  /** World x of the children's anchor in the canonical copy. */
  x: number;
  period: number;
  children: ReactNode;
}

/**
 * Draws its children once, in the copy of the wrapping world the pointer is
 * over: for overlays such as tooltips, which belong next to the ship or port
 * being hovered even when a very wide view shows it twice.
 */
export function PointerCopy({ x, period, children }: PointerCopyProps) {
  const group = useRef<Group>(null);

  useFrame(({ camera, pointer, raycaster }) => {
    if (!group.current) return;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(seaLevel, pointerOnSea)) return;
    group.current.position.x = copyShiftToward(x, pointerOnSea.x, period);
  });

  return <group ref={group}>{children}</group>;
}
