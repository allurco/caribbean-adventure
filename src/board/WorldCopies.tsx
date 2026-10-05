import { useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { controlsTarget } from "./controlsTarget";
import { seamAwareStart } from "./wrapView";

interface WorldCopiesProps {
  /** Wrap width in world units; Infinity draws the children once, unmoved. */
  period: number;
  /** West edge of the strip the world is built over (`seamStrip.ts`). */
  stripMinX: number;
  /** Copies to draw, counted from the one the camera focus is in (`wrapCopyRange`). */
  from: number;
  to: number;
  children: ReactNode;
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

  if (!Number.isFinite(period)) return <>{children}</>;
  return (
    <>
      {offsets.map((k, i) => (
        <group
          key={k}
          ref={(group) => {
            groups.current[i] = group;
          }}
        >
          {children}
        </group>
      ))}
    </>
  );
}

interface NearestCopyProps {
  /** World x of the children's anchor in the canonical copy. */
  x: number;
  period: number;
  /** Centre of the view relative to the focus, per unit camera distance (footprint mid-x). */
  viewCentreOffset: number;
  children: ReactNode;
}

/**
 * Draws its children once, in whichever copy of the wrapping world puts
 * their anchor nearest the middle of the view: for overlays such as tooltips
 * that must appear only once.
 */
export function NearestCopy({ x, period, viewCentreOffset, children }: NearestCopyProps) {
  const controls = useThree((state) => state.controls);
  const group = useRef<Group>(null);

  useFrame(({ camera }) => {
    const focus = controlsTarget(controls);
    if (!focus || !group.current) return;
    const centre = focus.x + camera.position.distanceTo(focus) * viewCentreOffset;
    group.current.position.x = seamAwareStart(x, centre, period) - x;
  });

  return <group ref={group}>{children}</group>;
}
