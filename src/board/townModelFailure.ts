/**
 * A town model that failed to load (#394): its piece is drawn code-built,
 * and the failure is logged once per file. Every mounted copy of the piece
 * (one per world copy, and the prop viewer's) has its own error boundary
 * that reports it, so the console would otherwise hear it once per copy.
 */
import type { TownModel } from "./townModels";

const logged = new Set<string>();

export function logTownModelFailure(model: TownModel, error: unknown): void {
  if (logged.has(model.file)) return;
  logged.add(model.file);
  console.warn(`[town] model ${model.file} failed to load; drawing the code-built ${model.kind}`, error);
}
