import { lazy, Suspense } from "react";
import { ShaderLab } from "./lab/ShaderLab";
import { PropViewer } from "./board/PropViewer";
import { SoundLab } from "./lab/SoundLab";
import { parseDevUrlParams } from "./board/devUrlParams";
import { loadGameClient, loadSeatClient, type GameClient } from "./loadGameClient";
import { GameClientLoader } from "./GameClientLoader";
import { LocalSeats } from "./LocalSeats";
import { parseAccountRoute, skipsLogin } from "./online/accountRoute";
import { supabaseConfig } from "./online/supabaseClient";

// The online pages (#105) and their corner link exist only when a backend is
// configured (src/online/supabaseConfig.ts); without one the app is the local
// hotseat game, exactly as before. Each is its own chunk.
const AccountPage = lazy(() => import("./online/AccountPage").then((m) => ({ default: m.AccountPage })));
const ProfilePage = lazy(() => import("./online/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const SignInGate = lazy(() => import("./online/SignInGate").then((m) => ({ default: m.SignInGate })));
const AccountLink = lazy(() => import("./online/AccountLink").then((m) => ({ default: m.AccountLink })));

// Dev URL parameters (#74), read once: a map size and seed pin the generated
// map, cx/cz/dist pin the camera's first view, view=props opens the prop
// viewer, view=sound the sound lab and seedGallery=1 the seed gallery.
// Absent, nothing changes. See "Dev URL parameters" in the README.
const devParams = parseDevUrlParams(window.location.search);
const isLab = window.location.hash === "#lab";
const accountRoute = supabaseConfig ? parseAccountRoute(window.location.search) : null;

// The seed gallery (#161) is dev only: the DEV guard drops it, and its chunk, from production builds.
const SeedGallery = import.meta.env.DEV ? lazy(() => import("./lab/SeedGallery")) : null;
const showSeedGallery = SeedGallery !== null && devParams.seedGallery === true;

const showsGame = !(isLab || devParams.propViewer || devParams.soundLab || showSeedGallery || accountRoute);

// With a backend configured the root URL is the sign-in screen, and the game
// sits behind it; `?skipLogin=1` goes straight to the game (temporary, until
// the online entry #125). Without a backend there is nothing to sign in to.
const loginGate = showsGame && supabaseConfig !== null && !skipsLogin(window.location.search);

// The game's map is generated in a worker (#124), started once and only for
// the game itself, not the labs or the prop viewer: here at load so it runs
// while React mounts, or behind the sign-in screen once a player is through.
let gameClientPromise: Promise<GameClient> | undefined;
function gameClient(): Promise<GameClient> {
  // Dev `?seats=1` (#110): every seat on one page, through the local transport
  gameClientPromise ??= devParams.localSeats ? loadSeatClient(devParams.setupData) : loadGameClient(devParams.setupData);
  return gameClientPromise;
}
if (showsGame && !loginGate) void gameClient();

export default function App() {
  // Visit http://localhost:5173/#lab for the shader sandbox,
  // http://localhost:5173/?view=props for the prop viewer (#59),
  // http://localhost:5173/?view=sound for the sound lab (#73) and
  // http://localhost:5173/?seedGallery=1 for the seed gallery (#161);
  // anything else loads the normal game. All stay fully isolated from game code.
  if (isLab) {
    return <ShaderLab />;
  }
  if (supabaseConfig && accountRoute) {
    return (
      <Suspense fallback={null}>
        {accountRoute.kind === "account" ? (
          <AccountPage config={supabaseConfig} />
        ) : (
          <ProfilePage config={supabaseConfig} id={accountRoute.id} />
        )}
      </Suspense>
    );
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
  if (devParams.soundLab || !showsGame) {
    return <SoundLab />;
  }
  if (supabaseConfig && loginGate) {
    return (
      <Suspense fallback={null}>
        <SignInGate config={supabaseConfig} backLink={false}>
          {() => <Game />}
        </SignInGate>
      </Suspense>
    );
  }
  return <Game />;
}

/** The local hotseat game, with the account link when a backend is configured. */
function Game() {
  const Loader = devParams.localSeats ? LocalSeats : GameClientLoader;
  return (
    <>
      <Loader
        client={gameClient()}
        cameraTarget={devParams.cameraTarget}
        cameraDistance={devParams.cameraDistance}
        seaBuoys={devParams.seaBuoys}
        regionBorder={devParams.regionBorder}
        renderStats={devParams.renderStats}
        gallerySnapshot={devParams.gallerySnapshot}
      />
      {supabaseConfig && (
        <Suspense fallback={null}>
          <AccountLink config={supabaseConfig} />
        </Suspense>
      )}
    </>
  );
}
