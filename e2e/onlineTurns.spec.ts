/**
 * Two signed-in captains play an online match from two browsers (#113):
 * a room is opened and joined by its invite link, started, and each seat
 * plays its turns on its own board, seeing the other's through `/api`.
 */
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PLAYERS } from "./e2ePlayers";

type Captain = (typeof E2E_PLAYERS)[keyof typeof E2E_PLAYERS];

/** A browser signed in as `captain`: a stored supabase-js session, as a magic link would leave. */
async function signedIn(browser: Browser, captain: Captain): Promise<Page> {
  const context = await browser.newContext();
  const session = {
    access_token: captain.token,
    refresh_token: `refresh-${captain.token}`,
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: captain.id, aud: "authenticated", role: "authenticated", email: `${captain.id}@example.test`, app_metadata: {}, user_metadata: {} },
  };
  // supabase-js keys the session by the URL's first host label: "localhost".
  await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), ["sb-localhost-auth-token", JSON.stringify(session)]);
  return context.newPage();
}

/** Picks the first captain in the hand and a Sloop. */
async function draft(page: Page): Promise<void> {
  await page.bringToFront();
  await expect(page.getByRole("heading", { name: "Choose Your Captain" })).toBeVisible({ timeout: 90_000 });
  await page.locator("button.group").first().click();
  await expect(page.getByRole("heading", { name: "Choose Your Ship" })).toBeVisible();
  await page.getByRole("button", { name: /Sloop/ }).click();
}

/** The page whose seat may act now, once it shows `heading` or the End Turn button. */
async function whoseTurn(pages: Page[], target: (page: Page) => ReturnType<Page["getByRole"]>): Promise<Page> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    for (const page of pages) if (await target(page).isVisible()) return page;
    await pages[0].waitForTimeout(500);
  }
  throw new Error("no seat came to act");
}

test("two captains open a room, start it, and play their turns from two browsers", async ({ browser }) => {
  // Two browsers, as two people would have: each renders its own board.
  const second = await chromium.launch();
  const anne = await signedIn(browser, E2E_PLAYERS.anne);
  const jack = await signedIn(second, E2E_PLAYERS.jack);

  // Anne opens a private room for two and shares its invite link.
  await anne.goto("/?view=rooms");
  await anne.getByRole("button", { name: "Open a private room" }).click();
  await expect(anne).toHaveURL(/view=room&id=/);
  const invite = await anne.getByLabel(/Invite link/).inputValue();

  // Jack opens it, signed in, and takes the second seat.
  await jack.goto(invite);
  await expect(jack).toHaveURL(/view=room&id=/);
  await expect(jack.getByRole("list", { name: "Captains" })).toContainText("Anne Bonny");
  await expect(jack.getByText("Waiting for the host to start the match…")).toBeVisible();

  // Anne's lobby sees him arrive; she starts the match.
  await expect(anne.getByRole("list", { name: "Captains" })).toContainText("Calico Jack", { timeout: 15_000 });
  await anne.getByRole("button", { name: "Start match" }).click();
  await anne.getByRole("link", { name: "Board your ship" }).click();
  await jack.getByRole("link", { name: "Board your ship" }).click({ timeout: 15_000 });
  await expect(anne).toHaveURL(/view=match&id=/);
  await expect(jack).toHaveURL(/view=match&id=/);

  // Turn 1 and 2: the draft, each seat picking on its own board in turn.
  const pages = [anne, jack];
  const captainChoice = (page: Page) => page.getByRole("heading", { name: "Choose Your Captain" });
  const firstPick = await test.step("first seat drafts", async () => {
    const page = await whoseTurn(pages, captainChoice);
    await draft(page);
    return page;
  });
  const other = firstPick === anne ? jack : anne;
  try {
    await test.step("second seat drafts", () => draft(other));
  } catch (error) {
    // The failure report shows the first browser's page; say what the other one shows.
    console.log(`second seat sees: ${await other.locator("body").innerText()}`);
    throw error;
  }

  // Turn 3: the main phase. The seat to play ends its turn; the other seat's board sees its own turn come.
  const endTurn = (page: Page) => page.getByRole("button", { name: "End Turn" });
  const playing = await test.step("a seat's main turn comes", () => whoseTurn(pages, endTurn));
  const waiting = playing === anne ? jack : anne;
  await expect(endTurn(waiting)).toBeHidden();
  await playing.bringToFront();
  await endTurn(playing).click();
  await expect(endTurn(waiting)).toBeVisible({ timeout: 30_000 });
  await expect(endTurn(playing)).toBeHidden();

  // Both captains leave to the harbour, where the voyage waits, saved, and come back to it (#301).
  const leave = async (page: Page) => {
    await page.bringToFront();
    await page.getByRole("link", { name: "Leave to harbour" }).click();
    await expect(page).toHaveURL(/view=rooms&saved=1/);
    await expect(page.getByText("Your voyage is saved.")).toBeVisible();
  };
  await test.step("the seat waited on leaves, and takes its turn from the harbour", async () => {
    await leave(waiting);
    await expect(waiting.getByText("It is your turn")).toBeVisible();
    await waiting.getByRole("link", { name: "Take your turn" }).click();
    await expect(waiting).toHaveURL(/view=match&id=/);
    await expect(endTurn(waiting)).toBeVisible({ timeout: 90_000 });
  });
  await test.step("the other seat leaves, and opens the voyage it waits on", async () => {
    await leave(playing);
    const voyages = playing.getByRole("list", { name: "Your voyages" });
    await expect(voyages).toContainText("Waiting on");
    await voyages.getByRole("link", { name: "Open" }).click();
    await expect(playing).toHaveURL(/view=match&id=/);
    await expect(playing.getByRole("link", { name: "Leave to harbour" })).toBeVisible({ timeout: 90_000 });
    await expect(endTurn(playing)).toBeHidden();
  });
  await second.close();
});
