import { Client } from "boardgame.io/react";
import { Caribbean } from "./game/Game";
import { CaribbeanBoard } from "./board/Board";

const CaribbeanClient = Client({
  game: Caribbean,
  board: CaribbeanBoard,
});

export default function App() {
  return <CaribbeanClient />;
}
