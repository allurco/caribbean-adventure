/**
 * Signing in with the email link signs in every open tab (#280): tab A asks
 * for the link and says "check your email", tab B opens the link, and tab A
 * comes aboard by itself, with no reload. Signing out in one tab signs the
 * other out. Two pages of one browser context share localStorage and
 * BroadcastChannel, as two tabs of one browser do.
 */
import { expect, test, type Page } from "@playwright/test";
import { E2E_PLAYERS } from "./e2ePlayers";

const { anne } = E2E_PLAYERS;

/** `SIGNED_IN_ELSEWHERE` in src/online/tabSignIn.ts. */
const SIGNED_IN_ELSEWHERE = "You are signed in: the sign-in finished in another tab.";

/** Where Supabase Auth sends the email link back to: the page that asked, the session in the hash (implicit flow). */
function magicLinkReturn(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const hash = new URLSearchParams({
    access_token: anne.token,
    expires_in: "3600",
    expires_at: String(expiresAt),
    refresh_token: `refresh-${anne.token}`,
    token_type: "bearer",
    type: "magiclink",
  });
  return `/?view=account#${hash.toString()}`;
}

async function askForLink(page: Page): Promise<void> {
  await page.goto("/?view=account");
  await page.getByLabel("Email address").fill("anne@example.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("A sign-in link is on its way");
}

test("the email link signs in every open tab, and signing out signs them all out", async ({ context }) => {
  // No WebGL: the harbour stays its still. The live scene, drawn in software
  // in two headless pages at once, can hold a page's main thread for seconds.
  await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id.startsWith("webgl") ? null : getContext.call(this, id, ...(rest as []));
    } as typeof getContext;
  });
  const tabA = await context.newPage();
  await askForLink(tabA);

  const tabB = await context.newPage();
  await tabB.goto(magicLinkReturn());
  await expect(tabB.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15_000 });

  // Tab A is behind tab B, as a tab left open is: it signs in by itself, and says so.
  await expect(tabA.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 3_000 });
  await expect(tabA.getByText(SIGNED_IN_ELSEWHERE)).toBeVisible();
  // The tab the link opened loaded signed in: nothing to explain there.
  await expect(tabB.getByText(SIGNED_IN_ELSEWHERE)).toHaveCount(0);

  await tabB.getByRole("button", { name: "Sign out" }).click();
  await expect(tabB.getByRole("heading", { name: "Sign in to sail" })).toBeVisible();
  await expect(tabA.getByRole("heading", { name: "Sign in to sail" })).toBeVisible({ timeout: 3_000 });
});
