// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSafeAreaInsets } from "./useSafeAreaInsets";

let container: HTMLDivElement;
let root: Root;
/** The body's children as each render saw them. */
let seenInRender: number[];

function Reader() {
  const insets = useSafeAreaInsets();
  seenInRender.push(document.body.childElementCount);
  return <p>{insets.top}</p>;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  seenInRender = [];
});

afterEach(() => {
  container.remove();
});

describe("useSafeAreaInsets", () => {
  it("adds nothing to the page while rendering; its probe goes in once mounted and out when the last reader leaves", () => {
    act(() => root.render(<Reader />));
    expect(seenInRender[0]).toBe(1); // the container alone
    expect(document.body.childElementCount).toBe(2); // the container and the probe

    act(() => root.unmount());
    expect(document.body.childElementCount).toBe(1);
  });

  it("reads no insets where the browser reports none", () => {
    act(() => root.render(<Reader />));
    expect(container.textContent).toBe("0");
    act(() => root.unmount());
  });
});
