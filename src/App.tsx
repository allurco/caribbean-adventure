import { Client } from "boardgame.io/react";
import { Caribbean } from "./game/Game";
import { CaribbeanBoard } from "./board/Board";
import { ShaderLab } from "./lab/ShaderLab";

const CaribbeanClient = Client({
  game: Caribbean,
  board: CaribbeanBoard,
});

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox; anything else
  // loads the normal game. Keeps the lab fully isolated from game code.
  if (window.location.hash === "#lab") {
    return <ShaderLab />;
  }
  return <CaribbeanClient />;
}
