import { Client } from "boardgame.io/react";
import { Caribbean, withSetupData } from "./game/Game";
import { CaribbeanBoard } from "./board/Board";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";
import { SoundLab } from "./lab/SoundLab";
import { parseDevUrlParams } from "./board/devUrlParams";
import { ShellPrototype } from "./board/prototypeShell/ShellPrototype";

// Dev URL parameters (#74), read once: a map size and seed pin the generated
// map, cx/cz/dist pin the camera's first view, view=props opens the prop
// viewer and view=sound the sound lab. Absent, nothing changes. See "Dev URL
// parameters" in the README.
const devParams = parseDevUrlParams(window.location.search);

const CaribbeanClient = Client({
  // The local client creates its match without setupData, so the pinned map
  // is fixed on the game itself; a server will pass it from match creation.
  game: withSetupData(Caribbean, devParams.setupData),
  board: CaribbeanBoard,
});

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox,
  // http://localhost:5173/?view=props for the prop viewer (#59) and
  // http://localhost:5173/?view=sound for the sound lab (#73); anything
  // else loads the normal game. All stay fully isolated from game code.
  if (window.location.hash === "#lab") {
    return <ShaderLab />;
  }
  if (devParams.propViewer) {
    return <PropViewer focus={devParams.propViewer.focus} />;
  }
  if (devParams.soundLab) {
    return <SoundLab />;
  }
  // Throwaway prototype of the online shell (#104): ?view=prototype-shell&variant=A&screen=home
  if (devParams.shellPrototype) {
    return <ShellPrototype />;
  }
  return <CaribbeanClient cameraTarget={devParams.cameraTarget} cameraDistance={devParams.cameraDistance} />;
}
