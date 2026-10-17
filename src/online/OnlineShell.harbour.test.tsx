// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClient } from "./accountClient";
import { HARBOUR_STILL } from "./harbourStillImage";
import type { SessionState } from "./useAccount";
import type { ProfileState } from "./useProfile";

// The live scene is the dev capture's alone (#418): the shell must never load it.
const scene = vi.hoisted(() => ({ loaded: false }));
vi.mock("../board/harbour/HarbourScene", () => {
  scene.loaded = true;
  return { HarbourScene: () => null };
});

// Signed in at once, with no Supabase behind it.
vi.mock("./useAccount", () => ({
  useAccountClient: (): AccountClient | undefined => ({}) as AccountClient,
  useAccountSession: (): SessionState => ({ status: "signedIn", session: { userId: "captain-1", email: "captain@example.test" } }),
}));
vi.mock("./useProfile", () => ({
  useProfile: (): [ProfileState, () => void] => [{ status: "loading" }, () => {}],
}));
vi.mock("./useShellFonts", () => ({ useShellFonts: () => {} }));
// Each page's sheet, reduced to its name: the sheets fetch, and the test is about the harbour behind them.
vi.mock("./ShellSheet", () => ({
  ShellSheet: ({ page }: { page: { kind: string } }): ReactNode => <p data-testid="sheet">{page.kind}</p>,
}));

const { OnlineShell } = await import("./OnlineShell");

const CONFIG = { url: "https://example.test", key: "anon" };

let container: HTMLDivElement;
let root: Root;
let contexts: string[];

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/");
  delete document.documentElement.dataset.harbour;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  contexts = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, id: string) {
    contexts.push(id);
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Lets every timer, idle wait and lazy chunk run out. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }
}

function clickLink(href: string): void {
  const link = [...container.querySelectorAll("a")].find((a) => a.getAttribute("href") === href);
  if (!link) throw new Error(`no link to ${href}`);
  act(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
}

function sheet(): string | null | undefined {
  return container.querySelector('[data-testid="sheet"]')?.textContent;
}

function showsTheStill(): boolean {
  return [...container.querySelectorAll<HTMLElement>("[style]")].some((el) => el.style.backgroundImage.includes(HARBOUR_STILL.path));
}

/** The harbour as the shell must show it on every page: the still, and no live scene. */
function expectStillOnly(): void {
  expect(showsTheStill()).toBe(true);
  expect(container.querySelector("canvas")).toBeNull();
  expect(contexts).toEqual([]);
  expect(scene.loaded).toBe(false);
  expect(document.documentElement.dataset.harbour).toBeUndefined();
}

describe("OnlineShell's harbour (#418: the still, no live scene)", () => {
  it("shows the still on every shell page and never draws the live scene", async () => {
    act(() => root.render(<OnlineShell config={CONFIG} initialPage={{ kind: "play" }} />));
    await settle();
    expectStillOnly();

    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    const pages = links.filter((href) => href.startsWith("?view=") || href === "/" || href.startsWith("/?"));
    expect(pages.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const href of pages) {
      clickLink(href);
      await settle();
      seen.add(sheet() ?? "");
      expectStillOnly();
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
