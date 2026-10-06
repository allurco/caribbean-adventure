import { Client } from "boardgame.io/react";
import { Caribbean } from "./game/Game";
import { CaribbeanBoard } from "./board/Board";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";

const CaribbeanClient = Client({
  game: Caribbean,
  board: CaribbeanBoard,
});

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox and
  // http://localhost:5173/?view=props for the prop viewer (#59); anything
  // else loads the normal game. Both stay fully isolated from game code.
  if (window.location.hash === "#lab") {
    return <ShaderLab />;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "props") {
    const focus = params.get("focus");
    return <PropViewer focus={focus === null ? undefined : Number(focus)} />;
  }
  return <CaribbeanClient />;
}
