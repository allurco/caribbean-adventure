/**
 * The flags ships fly (#134), as materials: each flag's design
 * (`shipFlags.ts`) painted once onto a small canvas, and one material per
 * flag shared by every ship that flies it. The flag mesh is single-sided
 * cloth, so the material is drawn on both faces: from the far side a ship's
 * flag shows its reverse, as a real flag does.
 */
import { CanvasTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace } from "three";
import { FLAG_ASPECT, flagDesign, paintFlag, type ShipFlag } from "./shipFlags";

/** The flag texture's hoist in pixels: a flag is a few pixels tall at ship zoom. */
const FLAG_TEXTURE_HOIST = 96;

/** Bare canvas, for a ship with no captain yet: the colour of the sails. */
const BARE_CLOTH = "#e8e0cc";

const materials = new Map<ShipFlag | null, MeshStandardMaterial>();

const flagTexture = (flag: ShipFlag): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.height = FLAG_TEXTURE_HOIST;
  canvas.width = Math.round(FLAG_TEXTURE_HOIST * FLAG_ASPECT);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("shipFlagMaterial: no 2D canvas to paint the flag on");
  paintFlag(ctx, flagDesign(flag), canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** The material a ship flying `flag` draws its flag with (`null`: bare cloth), made once. */
export function shipFlagMaterial(flag: ShipFlag | null): MeshStandardMaterial {
  let material = materials.get(flag);
  if (!material) {
    material = new MeshStandardMaterial({
      name: `Flag_${flag ?? "bare"}`,
      side: DoubleSide,
      roughness: 0.9,
      metalness: 0,
      ...(flag ? { map: flagTexture(flag) } : { color: BARE_CLOTH }),
    });
    materials.set(flag, material);
  }
  return material;
}
