import { lazy, Suspense } from "react";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";
import { SoundLab } from "./lab/SoundLab";
import { parseDevUrlParams, seatCount, showsDebugPanel, usesHotseatSave } from "./board/devUrlParams";
import { loadGameClient, loadSeatClient, type GameClient } from "./loadGameClient";
import { GameClientLoader } from "./GameClientLoader";
import { HotseatGame } from "./HotseatGame";
import { LocalSeats } from "./LocalSeats";
import { parseOnlineRoute } from "./online/onlineRoute";
import { parseShellPage } from "./online/shellRoute";
import { supabaseConfig } from "./online/supabaseClient";
import { HarbourBackdrop } from "./online/HarbourBackdrop";

// The online shell (#125), the match board (#113) and the corner link over
// the local game exist only when a backend is configured
// (src/online/supabaseConfig.ts); without one the app is the local hotseat
// game, exactly as before. Each is its own chunk.
const OnlineShell = lazy(() => import("./online/OnlineShell").then((m) => ({ default: m.OnlineShell })));
const AccountLink = lazy(() => import("./online/AccountLink").then((m) => ({ default: m.AccountLink })));
const OnlinePage = lazy(() => import("./online/OnlinePage").then((m) => ({ default: m.OnlinePage })));

// Dev URL parameters (#74), read once: a map size and seed pin the generated
// map, cx/cz/dist pin the camera's first view, view=props opens the prop
// viewer, view=sound the sound lab and seedGallery=1 the seed gallery.
// Absent, nothing changes. See "Dev URL parameters" in the README.
const devParams = parseDevUrlParams(window.location.search);
const isLab = window.location.hash === "#lab";

// The seed gallery (#161) is dev only: the DEV guard drops it, and its chunk, from production builds.
const SeedGallery = import.meta.env.DEV ? lazy(() => import("./lab/SeedGallery")) : null;
const showSeedGallery = SeedGallery !== null && devParams.seedGallery === true;
// The harbour backdrop's capture view (#122), dev only like the seed gallery.
const HarbourCapture = import.meta.env.DEV ? lazy(() => import("./board/harbour/HarbourCapture")) : null;
const showHarbourCapture = HarbourCapture !== null && devParams.harbourCapture === true;
const devView = isLab || devParams.propViewer || devParams.soundLab || showSeedGallery || showHarbourCapture;

// Only with a backend: the online shell (#125) at the root URL and its pages
// (Play, the account pages, the rooms), and a started match's board (#113).
// The root URL with `?skipLogin=1` or the dev parameters still opens the local game.
const shellPage = supabaseConfig && !devView ? parseShellPage(window.location.search) : null;
const onlineRoute = supabaseConfig && !devView ? parseOnlineRoute(window.location.search) : null;
const matchRoute = onlineRoute?.kind === "match" ? onlineRoute : null;

const showsGame = !(devView || shellPage || matchRoute);

// The game's map is generated in a worker (#124), started once and only for
// the game itself, not the labs or the prop viewer: here at load so it runs
// while React mounts.
let gameClientPromise: Promise<GameClient> | undefined;
function gameClient(): Promise<GameClient> {
  // Dev `?seats=1` (#110): every seat on one page, through the local transport
  const debugPanel = showsDebugPanel(devParams);
  // Solo, one captain against the NPCs, unless dev `?players=` asks for more seats (#278)
  const seats = seatCount(devParams);
  gameClientPromise ??= devParams.localSeats
    ? loadSeatClient(devParams.setupData, debugPanel, seats)
    : loadGameClient(devParams.setupData, debugPanel, seats);
  return gameClientPromise;
}
// The saved hotseat game (#300) starts from its own start screen, so only a
// match a dev URL pins (size, seed, the seats on one page), which never
// touches the save, starts here.
const savesHotseat = usesHotseatSave(devParams);
if (showsGame && !savesHotseat) void gameClient();

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox,
  // http://localhost:5173/?view=props for the prop viewer (#59),
  // http://localhost:5173/?view=sound for the sound lab (#73) and
  // http://localhost:5173/?seedGallery=1 for the seed gallery (#161);
  // anything else loads the normal game. All stay fully isolated from game code.
  if (isLab) {
    return <ShaderLab />;
  }
  if (supabaseConfig && shellPage) {
    // The harbour still is the very first paint (#122), before the shell's chunk is in.
    // A separate instance from the shell's own: `interactive={false}` keeps it the
    // still alone (it never mounts the live scene), and it goes when the shell's
    // backdrop takes its place, which paints the same still on its first frame.
    return (
      <Suspense fallback={<HarbourBackdrop interactive={false} />}>
        <OnlineShell config={supabaseConfig} initialPage={shellPage} />
      </Suspense>
    );
  }
  if (supabaseConfig && matchRoute) {
    return (
      <Suspense fallback={null}>
        <OnlinePage config={supabaseConfig} matchId={matchRoute.id} />
      </Suspense>
    );
  }
  if (devParams.propViewer) {
    return <PropViewer focus={devParams.propViewer.focus} />;
  }
  if (HarbourCapture && showHarbourCapture) {
    return (
      <Suspense fallback={null}>
        <HarbourCapture />
      </Suspense>
    );
  }
  if (SeedGallery && showSeedGallery) {
    return (
      <Suspense fallback={null}>
        <SeedGallery mapSize={devParams.setupData?.mapSize} />
      </Suspense>
    );
  }
  if (devParams.soundLab || !showsGame) {
    return <SoundLab />;
  }
  return <Game />;
}

/**
 * The local game (solo, or hotseat with dev `?players=`), with the account
 * link when a backend is configured. Saved in the browser unless a dev URL
 * pins the map or is the seats on one page (`usesHotseatSave`); with
 * `?players=` a save is continued only when it has those seats.
 */
function Game() {
  const viewProps = {
    cameraTarget: devParams.cameraTarget,
    cameraDistance: devParams.cameraDistance,
    seaBuoys: devParams.seaBuoys,
    regionBorder: devParams.regionBorder,
    renderOff: devParams.renderOff,
    gpu: devParams.gpu,
    renderStats: devParams.renderStats,
    gallerySnapshot: devParams.gallerySnapshot,
  };
  return (
    <>
      {savesHotseat ? (
        <HotseatGame {...viewProps} debugPanel={showsDebugPanel(devParams)} seats={seatCount(devParams)} request={{ players: devParams.players, setupData: devParams.setupData }} />
      ) : devParams.localSeats ? (
        <LocalSeats {...viewProps} client={gameClient()} seats={seatCount(devParams)} />
      ) : (
        <GameClientLoader {...viewProps} client={gameClient()} />
      )}
      {supabaseConfig && (
        <Suspense fallback={null}>
          <AccountLink config={supabaseConfig} />
        </Suspense>
      )}
    </>
  );
}
