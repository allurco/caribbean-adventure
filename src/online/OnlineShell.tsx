import type { AccountSession, Profile } from "./accountService";
import { HarbourBackdrop } from "./HarbourBackdrop";
import { ShellFrame } from "./ShellFrame";
import type { ShellPage } from "./shellRoute";
import { ShellSheet } from "./ShellSheet";
import { ShellSignIn } from "./ShellSignIn";
import { ShellStatus } from "./ShellStatus";
import type { SupabaseConfig } from "./supabaseConfig";
import { useAccountClient, useAccountSession } from "./useAccount";
import { useProfile, type ProfileState } from "./useProfile";
import { useShellFonts } from "./useShellFonts";
import { useShellLayout } from "./useShellLayout";
import { useShellNavigation } from "./useShellNavigation";
import { SIGNED_IN_ELSEWHERE } from "./tabSignIn";
import { useTabSignInNotice } from "./useTabSignInNotice";

/**
 * The online entry point (#125, the "Harbour launcher" of #104): the harbour,
 * and over it the sign-in screen or, once signed in, the nav board, the
 * nameboard and one sheet for the page. A signed-in player lands on Play.
 * Anyone's public profile shows signed out too. The harbour and the frame
 * stay mounted while the player moves between the shell's pages.
 */
export function OnlineShell({ config, initialPage }: { config: SupabaseConfig; initialPage: ShellPage }) {
  useShellFonts();
  const client = useAccountClient(config);
  const session = useAccountSession(client);
  const fit = useShellLayout();
  const { page, onClick } = useShellNavigation(initialPage);
  const signedIn = session.status === "signedIn" ? session.session : null;
  const [ownProfile, setOwnProfile] = useProfile(client, signedIn?.userId ?? null);
  // Another tab of this browser signed in (#280), such as the one the email link opened: a tab
  // that was showing signed out, on any page (the sign-in screen, a public profile), comes aboard
  // by itself and says so.
  const signedInElsewhere = useTabSignInNotice(session, pageKey(page));

  const ready = client !== undefined && session.status !== "loading";
  const publicPage = page.kind === "profile";

  return (
    // Clicks on links bubble here so the shell can move between its pages in place.
    <div onClick={onClick} className="absolute inset-0 overflow-hidden bg-shell-harbour font-garamond">
      {/* Mounts the live harbour only once the shell can be used */}
      <HarbourBackdrop interactive={ready} />
      {/* Mounted from the first paint, so screen readers announce the line once it is filled (#280) */}
      <p role="status" className="sr-only">
        {signedInElsewhere ? SIGNED_IN_ELSEWHERE : ""}
      </p>
      {!ready ? (
        <ShellStatus />
      ) : signedIn || publicPage ? (
        <ShellFrame fit={fit} page={page} captain={signedIn ? captainOf(signedIn, ownProfile) : null}>
          {signedInElsewhere && (
            <p aria-hidden="true" className="mb-4 border-l-2 border-shell-rule pl-2.5 text-[15px] text-shell-ink-soft">
              {SIGNED_IN_ELSEWHERE}
            </p>
          )}
          <ShellSheet key={pageKey(page)} page={page} client={client} session={signedIn} ownProfile={ownProfile} onProfileSaved={setOwnProfile} />
        </ShellFrame>
      ) : (
        <ShellSignIn client={client} />
      )}
    </div>
  );
}

/** The signed-in captain for the nav board: their profile once read, else a nameless seal on their id. */
function captainOf(session: AccountSession, profile: ProfileState): Profile {
  return profile.status === "ready" ? profile.profile : { id: session.userId, displayName: "", avatarUrl: null, deleted: false };
}

function pageKey(page: ShellPage): string {
  return JSON.stringify(page);
}
