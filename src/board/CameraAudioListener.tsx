import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { audioEngine } from "../audio/sharedAudioEngine";

/** Carries the game's audio listener on the R3F camera, so world sounds are heard from the view (#73). */
export function CameraAudioListener() {
  const camera = useThree((state) => state.camera);
  useEffect(() => audioEngine.attachTo(camera), [camera]);
  return null;
}
