import { Client } from "boardgame.io/react";
import { Caribbean, withSetupData } from "./game/Game";
import { CaribbeanBoard } from "./board/Board";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";
import { parseDevUrlParams } from "./board/devUrlParams";
import { setSharedTerrainFieldOptions } from "./board/visuals/sharedTerrainField";
import { PROP_SCALE } from "./board/visuals/propScale";

// Dev URL parameters (#74), read once: a map size and seed pin the generated
// map, cx/cz/dist pin the camera's first view, view=props opens the prop
// viewer. Absent, nothing changes. See "Dev URL parameters" in the README.
const devParams = parseDevUrlParams(window.location.search);
// The #83 prototype's massifs are a field option; every consumer shares the field.
// The #84 town plateaus (`&townGround=1`) are sized at the prop scale.
setSharedTerrainFieldOptions({
  massifs: devParams.massifs,
  townPlateaus: devParams.townGround ? { scale: PROP_SCALE } : undefined,
});

const CaribbeanClient = Client({
  // The local client creates its match without setupData, so the pinned map
  // is fixed on the game itself; a server will pass it from match creation.
  game: withSetupData(Caribbean, devParams.setupData),
  board: CaribbeanBoard,
});

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox and
  // http://localhost:5173/?view=props for the prop viewer (#59); anything
  // else loads the normal game. Both stay fully isolated from game code.
  if (window.location.hash === "#lab") {
    return <ShaderLab />;
  }
  if (devParams.propViewer) {
    return <PropViewer focus={devParams.propViewer.focus} />;
  }
  return (
    <CaribbeanClient
      cameraTarget={devParams.cameraTarget}
      cameraDistance={devParams.cameraDistance}
      houseBoxes={devParams.houseBoxes}
      minDistance={devParams.minDistance}
    />
  );
}
