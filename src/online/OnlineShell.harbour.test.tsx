// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountClient } from "./accountClient";
import type { SessionState } from "./useAccount";
import type { ProfileState } from "./useProfile";

// The live scene, counted: what the test is about is how often it mounts.
const scene = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock("../board/harbour/HarbourScene", async () => {
  const { useEffect } = await import("react");
  return {
    HarbourScene: () => {
      useEffect(() => {
        scene.mounts += 1;
        return () => {
          scene.unmounts += 1;
        };
      }, []);
      return <div data-testid="harbour-scene" />;
    },
  };
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

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  scene.mounts = 0;
  scene.unmounts = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

/** Lets the idle wait run out and the lazy scene's chunk resolve. */
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

describe("OnlineShell's harbour (#122)", () => {
  it("mounts the live scene once and keeps it across the shell's pages", async () => {
    act(() => root.render(<OnlineShell config={CONFIG} initialPage={{ kind: "play" }} />));
    await settle();
    expect(container.querySelector('[data-testid="harbour-scene"]')).not.toBeNull();
    expect(scene.mounts).toBe(1);

    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    const pages = links.filter((href) => href.startsWith("?view=") || href === "/" || href.startsWith("/?"));
    expect(pages.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const href of pages) {
      clickLink(href);
      await settle();
      seen.add(sheet() ?? "");
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(scene.mounts).toBe(1);
    expect(scene.unmounts).toBe(0);
  });
});
