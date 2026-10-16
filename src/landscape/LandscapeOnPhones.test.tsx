// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The phone's pose, set by each test; the hook itself reads the window.
const phone = vi.hoisted(() => ({ portrait: false, listeners: new Set<() => void>() }));
vi.mock("./usePortraitPhone", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePortraitPhone: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          phone.listeners.add(listener);
          return () => phone.listeners.delete(listener);
        },
        () => phone.portrait,
      ),
  };
});
vi.mock("../online/useShellFonts", () => ({ useShellFonts: () => {} }));

const { LandscapeOnPhones } = await import("./LandscapeOnPhones");
const { rotateGatePresence } = await import("./rotateGatePresence");

function turn(portrait: boolean) {
  act(() => {
    phone.portrait = portrait;
    for (const listener of phone.listeners) listener();
  });
}

/** Counts its mounts: the game under the gate must never remount. */
const game = { mounts: 0 };
function Game() {
  useEffect(() => {
    game.mounts += 1;
  }, []);
  return <button type="button">Sail</button>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  game.mounts = 0;
  phone.portrait = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const gate = () => container.querySelector<HTMLElement>('[role="dialog"]');
const wrapper = () => container.firstElementChild as HTMLElement;

describe("LandscapeOnPhones", () => {
  it("shows the game alone in landscape", () => {
    act(() => root.render(<LandscapeOnPhones><Game /></LandscapeOnPhones>));
    expect(gate()).toBeNull();
    expect(wrapper().getAttribute("aria-hidden")).toBeNull();
    expect(rotateGatePresence.showing()).toBe(false);
  });

  it("held upright, covers the game with the gate, hides the game from screen readers and takes focus", () => {
    act(() => root.render(<LandscapeOnPhones><Game /></LandscapeOnPhones>));
    turn(true);
    expect(gate()).not.toBeNull();
    expect(wrapper().getAttribute("aria-hidden")).toBe("true");
    expect(wrapper().hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(gate());
    expect(rotateGatePresence.showing()).toBe(true);
  });

  it("lifts the gate as the phone turns back, and lets go of the gate's presence", () => {
    act(() => root.render(<LandscapeOnPhones><Game /></LandscapeOnPhones>));
    turn(true);
    turn(false);
    expect(gate()).toBeNull();
    expect(wrapper().getAttribute("aria-hidden")).toBeNull();
    expect(rotateGatePresence.showing()).toBe(false);
  });

  it("never remounts the game as the phone turns", () => {
    act(() => root.render(<LandscapeOnPhones><Game /></LandscapeOnPhones>));
    turn(true);
    turn(false);
    turn(true);
    expect(game.mounts).toBe(1);
  });
});
