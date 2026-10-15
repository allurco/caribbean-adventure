import { useRef } from "react";
import type { Mesh } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { CAMERA_PITCH } from "./cameraBounds";
import { controlsTarget } from "./controlsTarget";
import { regionLabelOpacity, type RegionLabel } from "./regionMap";

/** The names' size in world units: a sea's name, larger than a port's, read at map zoom. */
const REGION_LABEL_FONT_SIZE = 0.8;
/** Raised over the sea so the swell never laps over the letters. */
const REGION_LABEL_Y = 0.8;

/** The troika text mesh behind drei's `Text`, with the opacities it reads each frame. */
type LabelText = Mesh & { fillOpacity: number; outlineOpacity: number };

/**
 * The regions' names for one world copy (#239): quiet, wide-spaced letters
 * over each region's open water, turned to the camera's fixed pitch, fading
 * out as the camera closes in on a ship (`regionLabelOpacity`).
 */
export function RegionLabels({ labels }: { labels: readonly RegionLabel[] }) {
  const controls = useThree((s) => s.controls);
  const texts = useRef<(LabelText | null)[]>([]);

  useFrame(({ camera }) => {
    const focus = controlsTarget(controls);
    const opacity = regionLabelOpacity(focus ? camera.position.distanceTo(focus) : Infinity);
    for (const text of texts.current) {
      if (!text) continue;
      text.fillOpacity = opacity;
      text.outlineOpacity = opacity * 0.5;
      text.visible = opacity > 0;
    }
  });

  return (
    <>
      {labels.map((label, i) => (
        <Text
          key={label.region}
          ref={(text: LabelText | null) => {
            texts.current[i] = text;
          }}
          position={[label.x, REGION_LABEL_Y, label.z]}
          // Facing the camera, which looks due north at a fixed pitch (cameraBounds.ts)
          rotation={[-CAMERA_PITCH, 0, 0]}
          fontSize={REGION_LABEL_FONT_SIZE}
          letterSpacing={0.12}
          color="#f6ead0"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#1c1917"
          raycast={() => null}
        >
          {label.name.toUpperCase()}
        </Text>
      ))}
    </>
  );
}
