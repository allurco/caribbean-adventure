import { describe, expect, it, vi } from "vitest";
import { createHeldOnce } from "./heldOnce";

describe("createHeldOnce", () => {
  it("builds once, however often it is asked for", () => {
    const build = vi.fn(() => Promise.resolve("world"));
    const world = createHeldOnce(build);
    expect(world.once()).toBe(world.once());
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("lets the value go once its holder releases it, so the next ask builds again", () => {
    const build = vi.fn(() => Promise.resolve("world"));
    const world = createHeldOnce(build);
    const first = world.once();
    const release = world.hold(first);
    release();
    expect(world.once()).not.toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("keeps the value through StrictMode's release and hold again", () => {
    const build = vi.fn(() => Promise.resolve("world"));
    const world = createHeldOnce(build);
    const first = world.once();
    world.hold(first)();
    world.hold(first);
    expect(world.once()).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("does not let go of a newer value when an old holder releases late", () => {
    const build = vi.fn(() => Promise.resolve("world"));
    const world = createHeldOnce(build);
    const first = world.once();
    const releaseFirst = world.hold(first);
    releaseFirst();
    const second = world.once();
    world.hold(second);
    releaseFirst();
    expect(world.once()).toBe(second);
  });
});
