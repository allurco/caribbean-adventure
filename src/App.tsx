import { lazy, Suspense } from "react";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";
import { SoundLab } from "./lab/SoundLab";
import { parseDevUrlParams } from "./board/devUrlParams";
import { loadGameClient } from "./loadGameClient";
import { GameClientLoader } from "./GameClientLoader";

// Dev URL parameters (#74), read once: a map size and seed pin the generated
// map, cx/cz/dist pin the camera's first view, view=props opens the prop
// viewer, view=sound the sound lab and seedGallery=1 the seed gallery.
// Absent, nothing changes. See "Dev URL parameters" in the README.
const devParams = parseDevUrlParams(window.location.search);
const isLab = window.location.hash === "#lab";

// The seed gallery (#161) is dev only: the DEV guard drops it, and its chunk, from production builds.
const SeedGallery = import.meta.env.DEV ? lazy(() => import("./lab/SeedGallery")) : null;
const showSeedGallery = SeedGallery !== null && devParams.seedGallery === true;

// The game's map is generated in a worker (#124), started here at load so it
// runs while React mounts; the local client's match starts on it. Only for
// the game itself, not the labs or the prop viewer.
const gameClient =
  isLab || devParams.propViewer || devParams.soundLab || showSeedGallery ? undefined : loadGameClient(devParams.setupData);

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox,
  // http://localhost:5173/?view=props for the prop viewer (#59),
  // http://localhost:5173/?view=sound for the sound lab (#73) and
  // http://localhost:5173/?seedGallery=1 for the seed gallery (#161);
  // anything else loads the normal game. All stay fully isolated from game code.
  if (isLab) {
    return <ShaderLab />;
  }
  if (devParams.propViewer) {
    return <PropViewer focus={devParams.propViewer.focus} />;
  }
  if (SeedGallery && showSeedGallery) {
    return (
      <Suspense fallback={null}>
        <SeedGallery mapSize={devParams.setupData?.mapSize} />
      </Suspense>
    );
  }
  if (devParams.soundLab || !gameClient) {
    return <SoundLab />;
  }
  return (
    <GameClientLoader
      client={gameClient}
      cameraTarget={devParams.cameraTarget}
      cameraDistance={devParams.cameraDistance}
      seaBuoys={devParams.seaBuoys}
      renderStats={devParams.renderStats}
      gallerySnapshot={devParams.gallerySnapshot}
    />
  );
}
