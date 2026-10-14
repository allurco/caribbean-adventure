import { describe, it, expect, vi } from "vitest";
import { SHIP_MODELS, shipModelUrl } from "./board/shipModels";

const preload = vi.hoisted(() => vi.fn());
vi.mock("@react-three/drei", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@react-three/drei")>()),
  useGLTF: Object.assign(() => undefined, { preload }),
}));

describe("loading the game client", () => {
  it("starts fetching every ship model before the map is generated (#136)", async () => {
    // Importing the module is all App does before calling it, so the models load during the map-loading screen.
    await import("./loadGameClient");
    const urls = Object.values(SHIP_MODELS).flatMap((model) => (model ? [shipModelUrl(model, import.meta.env.BASE_URL)] : []));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(preload).toHaveBeenCalledWith(url, false, false);
  });
});
