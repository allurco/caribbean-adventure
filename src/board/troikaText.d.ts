/** The one troika-three-text call the board makes directly (drei's Text draws with it); the package ships no types. */
declare module "troika-three-text" {
  export function preloadFont(options: { font?: string; characters: string | string[]; sdfGlyphSize?: number }, callback: () => void): void;
}
